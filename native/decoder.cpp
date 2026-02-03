#include <napi.h>
#include <string>
#include <iostream>
#include <cstring>

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
#include <libavutil/hwcontext.h>
#include <libswscale/swscale.h>
}

class MarchenDecoder : public Napi::ObjectWrap<MarchenDecoder> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "MarchenDecoder", {
            InstanceMethod("open", &MarchenDecoder::Open),
            InstanceMethod("setVideoBuffer", &MarchenDecoder::SetVideoBuffer),
            InstanceMethod("decodeFrame", &MarchenDecoder::DecodeFrame),
            InstanceMethod("seek", &MarchenDecoder::Seek),
            InstanceMethod("close", &MarchenDecoder::Close),
            InstanceMethod("getHwAccelInfo", &MarchenDecoder::GetHwAccelInfo),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("MarchenDecoder", func);
        return exports;
    }

    MarchenDecoder(const Napi::CallbackInfo& info) : Napi::ObjectWrap<MarchenDecoder>(info) {}

    ~MarchenDecoder() {
        Cleanup();
    }

private:
    // FFmpeg 上下文
    AVFormatContext* format_ctx = nullptr;
    AVCodecContext* codec_ctx = nullptr;
    SwsContext* sws_ctx = nullptr;
    AVFrame* frame = nullptr;
    AVFrame* sw_frame = nullptr;  // 用于硬解时从 GPU 拷贝
    AVFrame* rgb_frame = nullptr;
    AVPacket* packet = nullptr;
    AVBufferRef* hw_device_ctx = nullptr;
    
    int video_stream_index = -1;
    bool using_hw_accel = false;
    AVPixelFormat hw_pix_fmt = AV_PIX_FMT_NONE;
    std::string hw_device_name;
    
    // 共享内存指针
    uint8_t* video_buffer_ptr = nullptr;
    size_t video_buffer_size = 0;

    // 视频信息
    int video_width = 0;
    int video_height = 0;

    void Cleanup() {
        if (sws_ctx) {
            sws_freeContext(sws_ctx);
            sws_ctx = nullptr;
        }
        if (codec_ctx) {
            avcodec_free_context(&codec_ctx);
            codec_ctx = nullptr;
        }
        if (format_ctx) {
            avformat_close_input(&format_ctx);
            format_ctx = nullptr;
        }
        if (frame) {
            av_frame_free(&frame);
            frame = nullptr;
        }
        if (sw_frame) {
            av_frame_free(&sw_frame);
            sw_frame = nullptr;
        }
        if (rgb_frame) {
            av_frame_free(&rgb_frame);
            rgb_frame = nullptr;
        }
        if (packet) {
            av_packet_free(&packet);
            packet = nullptr;
        }
        if (hw_device_ctx) {
            av_buffer_unref(&hw_device_ctx);
            hw_device_ctx = nullptr;
        }
        
        video_stream_index = -1;
        using_hw_accel = false;
        hw_pix_fmt = AV_PIX_FMT_NONE;
        video_buffer_ptr = nullptr;
        video_buffer_size = 0;
    }

    // 尝试初始化硬件加速
    bool TryInitHwAccel(const AVCodec* codec) {
        // 按优先级尝试不同的硬件加速方案
        const char* hw_types[] = {
#ifdef __APPLE__
            "videotoolbox",
#elif _WIN32
            "d3d11va",
            "dxva2",
            "cuda",
#else
            "vaapi",
            "vdpau",
            "cuda",
#endif
            nullptr
        };

        for (int i = 0; hw_types[i] != nullptr; i++) {
            AVHWDeviceType type = av_hwdevice_find_type_by_name(hw_types[i]);
            if (type == AV_HWDEVICE_TYPE_NONE) continue;

            // 检查 codec 是否支持该硬件加速
            for (int j = 0;; j++) {
                const AVCodecHWConfig* config = avcodec_get_hw_config(codec, j);
                if (!config) break;
                
                if (config->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX &&
                    config->device_type == type) {
                    
                    // 尝试创建硬件设备上下文
                    int ret = av_hwdevice_ctx_create(&hw_device_ctx, type, nullptr, nullptr, 0);
                    if (ret >= 0) {
                        hw_pix_fmt = config->pix_fmt;
                        hw_device_name = hw_types[i];
                        return true;
                    }
                }
            }
        }
        return false;
    }

    static AVPixelFormat GetHwFormat(AVCodecContext* ctx, const AVPixelFormat* pix_fmts) {
        MarchenDecoder* decoder = static_cast<MarchenDecoder*>(ctx->opaque);
        for (const AVPixelFormat* p = pix_fmts; *p != AV_PIX_FMT_NONE; p++) {
            if (*p == decoder->hw_pix_fmt) {
                return *p;
            }
        }
        // 没找到硬件格式，回退到软解
        return pix_fmts[0];
    }

public:
    // 打开文件并初始化解码器
    Napi::Value Open(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Cleanup();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::Error::New(env, "File path string expected").ThrowAsJavaScriptException();
            return env.Null();
        }

        std::string filename = info[0].As<Napi::String>().Utf8Value();
        
        // 可选参数：是否强制软解
        bool force_sw_decode = false;
        if (info.Length() > 1 && info[1].IsObject()) {
            Napi::Object options = info[1].As<Napi::Object>();
            if (options.Has("forceSoftwareDecode")) {
                force_sw_decode = options.Get("forceSoftwareDecode").ToBoolean().Value();
            }
        }

        // 打开文件
        int ret = avformat_open_input(&format_ctx, filename.c_str(), nullptr, nullptr);
        if (ret < 0) {
            char errbuf[256];
            av_strerror(ret, errbuf, sizeof(errbuf));
            Napi::Error::New(env, std::string("Could not open file: ") + errbuf).ThrowAsJavaScriptException();
            return env.Null();
        }

        ret = avformat_find_stream_info(format_ctx, nullptr);
        if (ret < 0) {
            Napi::Error::New(env, "Could not find stream info").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 寻找视频流
        const AVCodec* codec = nullptr;
        video_stream_index = av_find_best_stream(format_ctx, AVMEDIA_TYPE_VIDEO, -1, -1, &codec, 0);
        
        if (video_stream_index < 0) {
            Napi::Error::New(env, "No video stream found").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 初始化解码器上下文
        codec_ctx = avcodec_alloc_context3(codec);
        if (!codec_ctx) {
            Napi::Error::New(env, "Could not allocate codec context").ThrowAsJavaScriptException();
            return env.Null();
        }

        ret = avcodec_parameters_to_context(codec_ctx, format_ctx->streams[video_stream_index]->codecpar);
        if (ret < 0) {
            Napi::Error::New(env, "Could not copy codec parameters").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 尝试硬件加速
        if (!force_sw_decode && TryInitHwAccel(codec)) {
            codec_ctx->hw_device_ctx = av_buffer_ref(hw_device_ctx);
            codec_ctx->opaque = this;
            codec_ctx->get_format = GetHwFormat;
            using_hw_accel = true;
        }

        // 打开解码器
        ret = avcodec_open2(codec_ctx, codec, nullptr);
        if (ret < 0) {
            char errbuf[256];
            av_strerror(ret, errbuf, sizeof(errbuf));
            Napi::Error::New(env, std::string("Could not open codec: ") + errbuf).ThrowAsJavaScriptException();
            return env.Null();
        }

        // 保存视频尺寸
        video_width = codec_ctx->width;
        video_height = codec_ctx->height;

        // 预分配内存
        frame = av_frame_alloc();
        sw_frame = av_frame_alloc();
        rgb_frame = av_frame_alloc();
        packet = av_packet_alloc();

        if (!frame || !sw_frame || !rgb_frame || !packet) {
            Napi::Error::New(env, "Could not allocate frames/packet").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 返回视频元数据
        Napi::Object result = Napi::Object::New(env);
        result.Set("width", video_width);
        result.Set("height", video_height);
        result.Set("duration", (double)format_ctx->duration / AV_TIME_BASE);
        result.Set("frameRate", av_q2d(format_ctx->streams[video_stream_index]->avg_frame_rate));
        result.Set("codecName", codec->name);
        result.Set("hwAccel", using_hw_accel);
        result.Set("hwDevice", hw_device_name);
        
        // 返回需要的 buffer 大小
        result.Set("bufferSize", video_width * video_height * 4);
        
        return result;
    }

    // 接收 JS 传入的 Buffer
    Napi::Value SetVideoBuffer(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsTypedArray()) {
            Napi::Error::New(env, "Uint8Array expected").ThrowAsJavaScriptException();
            return env.Null();
        }

        Napi::TypedArray typedArray = info[0].As<Napi::TypedArray>();
        
        if (typedArray.TypedArrayType() != napi_uint8_array && 
            typedArray.TypedArrayType() != napi_uint8_clamped_array) {
            Napi::Error::New(env, "Buffer must be Uint8Array or Uint8ClampedArray").ThrowAsJavaScriptException();
            return env.Null();
        }

        size_t length;
        void* data;
        napi_value arraybuffer;
        size_t byte_offset;
        
        napi_status status = napi_get_typedarray_info(
            env, info[0], nullptr, &length, &data, &arraybuffer, &byte_offset
        );

        if (status != napi_ok) {
            Napi::Error::New(env, "Failed to get buffer pointer").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 检查 buffer 大小
        size_t required_size = video_width * video_height * 4;
        if (length < required_size) {
            Napi::Error::New(env, "Buffer too small").ThrowAsJavaScriptException();
            return env.Null();
        }

        video_buffer_ptr = (uint8_t*)data;
        video_buffer_size = length;
        
        return Napi::Boolean::New(env, true);
    }

    // 解码下一帧并写入 Buffer
    Napi::Value DecodeFrame(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!codec_ctx || !video_buffer_ptr) {
            return env.Null();
        }

        int response;
        while (av_read_frame(format_ctx, packet) >= 0) {
            if (packet->stream_index == video_stream_index) {
                response = avcodec_send_packet(codec_ctx, packet);
                if (response < 0) {
                    av_packet_unref(packet);
                    continue;
                }

                response = avcodec_receive_frame(codec_ctx, frame);
                if (response == AVERROR(EAGAIN) || response == AVERROR_EOF) {
                    av_packet_unref(packet);
                    continue;
                } else if (response < 0) {
                    av_packet_unref(packet);
                    return env.Null();
                }

                // 如果是硬解，需要从 GPU 拷贝到 CPU
                AVFrame* src_frame = frame;
                if (using_hw_accel && frame->format == hw_pix_fmt) {
                    response = av_hwframe_transfer_data(sw_frame, frame, 0);
                    if (response < 0) {
                        av_packet_unref(packet);
                        continue;
                    }
                    src_frame = sw_frame;
                }

                // 初始化/更新 sws 上下文
                if (!sws_ctx || 
                    sws_ctx == nullptr) {  // 可以添加更多条件检查
                    
                    if (sws_ctx) sws_freeContext(sws_ctx);
                    
                    sws_ctx = sws_getContext(
                        video_width, video_height, 
                        (AVPixelFormat)src_frame->format,
                        video_width, video_height, 
                        AV_PIX_FMT_RGBA,
                        SWS_BILINEAR, nullptr, nullptr, nullptr
                    );
                    
                    if (!sws_ctx) {
                        av_packet_unref(packet);
                        Napi::Error::New(env, "Could not create sws context").ThrowAsJavaScriptException();
                        return env.Null();
                    }
                }

                // 直接输出到共享内存
                uint8_t* dest[4] = { video_buffer_ptr, nullptr, nullptr, nullptr };
                int dest_linesize[4] = { video_width * 4, 0, 0, 0 };

                sws_scale(sws_ctx,
                    src_frame->data, src_frame->linesize, 
                    0, video_height,
                    dest, dest_linesize
                );

                fprintf(stderr, "Frame decoded: %dx%d, pts=%f, first pixel RGBA: %d,%d,%d,%d\n", 
    video_width, video_height, puts,
    video_buffer_ptr[0], video_buffer_ptr[1], 
    video_buffer_ptr[2], video_buffer_ptr[3]);

                // 计算 PTS
                double pts = frame->best_effort_timestamp * 
                    av_q2d(format_ctx->streams[video_stream_index]->time_base);

                av_packet_unref(packet);
                
                Napi::Object ret = Napi::Object::New(env);
                ret.Set("pts", pts);
                ret.Set("width", video_width);
                ret.Set("height", video_height);
                return ret;
            }
            av_packet_unref(packet);
        }

        return env.Null(); // EOF
    }

    // Seek 到指定时间点
    Napi::Value Seek(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!format_ctx || info.Length() < 1 || !info[0].IsNumber()) {
            return Napi::Boolean::New(env, false);
        }

        double timestamp = info[0].As<Napi::Number>().DoubleValue();
        int64_t ts = (int64_t)(timestamp * AV_TIME_BASE);
        
        int ret = av_seek_frame(format_ctx, -1, ts, AVSEEK_FLAG_BACKWARD);
        if (ret < 0) {
            return Napi::Boolean::New(env, false);
        }

        // 清空解码器缓冲
        avcodec_flush_buffers(codec_ctx);
        
        return Napi::Boolean::New(env, true);
    }

    Napi::Value Close(const Napi::CallbackInfo& info) {
        Cleanup();
        return info.Env().Undefined();
    }

    // 获取硬件加速信息
    Napi::Value GetHwAccelInfo(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        Napi::Object result = Napi::Object::New(env);
        
        result.Set("enabled", using_hw_accel);
        result.Set("device", hw_device_name);
        
        // 列出所有可用的硬件加速类型
        Napi::Array available = Napi::Array::New(env);
        int idx = 0;
        AVHWDeviceType type = AV_HWDEVICE_TYPE_NONE;
        while ((type = av_hwdevice_iterate_types(type)) != AV_HWDEVICE_TYPE_NONE) {
            available.Set(idx++, Napi::String::New(env, av_hwdevice_get_type_name(type)));
        }
        result.Set("available", available);
        
        return result;
    }
};

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return MarchenDecoder::Init(env, exports);
}

NODE_API_MODULE(marchen_decoder, InitAll)
