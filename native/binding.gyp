{
  "targets": [
    {
      "target_name": "marchen_decoder",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": ["decoder.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "CLANG_CXX_LIBRARY": "libc++",
              "MACOSX_DEPLOYMENT_TARGET": "10.15",
              "OTHER_CFLAGS": [
                "<!@(pkg-config --cflags libavformat libavcodec libavutil libswscale)"
              ]
            },
            "libraries": [
              "<!@(pkg-config --libs libavformat libavcodec libavutil libswscale)"
            ]
          }
        ],
        [
          "OS=='linux'",
          {
            "cflags": [
              "<!@(pkg-config --cflags libavformat libavcodec libavutil libswscale)"
            ],
            "libraries": [
              "<!@(pkg-config --libs libavformat libavcodec libavutil libswscale)"
            ]
          }
        ],
        [
          "OS=='win'",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalIncludeDirectories": [
                  "<(module_root_dir)/deps/ffmpeg/include"
                ]
              },
              "VCLinkerTool": {
                "AdditionalLibraryDirectories": [
                  "<(module_root_dir)/deps/ffmpeg/lib"
                ]
              }
            },
            "libraries": [
              "-lavformat",
              "-lavcodec", 
              "-lavutil",
              "-lswscale"
            ],
            "copies": [
              {
                "destination": "<(module_root_dir)/native/build/Release",
                "files": [
                  "<(module_root_dir)/deps/ffmpeg/bin/avformat-61.dll",
                  "<(module_root_dir)/deps/ffmpeg/bin/avcodec-61.dll",
                  "<(module_root_dir)/deps/ffmpeg/bin/avutil-59.dll",
                  "<(module_root_dir)/deps/ffmpeg/bin/swscale-8.dll"
                ]
              }
            ]
          }
        ]
      ]
    }
  ]
}
