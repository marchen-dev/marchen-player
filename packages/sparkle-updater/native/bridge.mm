#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>

// 标准窗口始终由 Sparkle 管理；所有入口只允许 Electron 的 macOS 主线程调用。
static SPUStandardUpdaterController *controller;
static void (^pendingInstall)(void);
static BOOL playing = NO;
static BOOL deferredNotice = NO;
static napi_threadsafe_function events = nullptr;

static void Emit(const char *name) {
  if (events) napi_call_threadsafe_function(events, (void *)name, napi_tsfn_nonblocking);
}

@interface MarchenUpdaterDelegate : NSObject <SPUUpdaterDelegate, SPUStandardUserDriverDelegate>
@end
@implementation MarchenUpdaterDelegate
- (BOOL)supportsGentleScheduledUpdateReminders { return YES; }
- (BOOL)standardUserDriverShouldHandleShowingScheduledUpdate:(SUAppcastItem *)item andInImmediateFocus:(BOOL)focus {
  return !playing;
}
- (void)standardUserDriverWillHandleShowingUpdate:(BOOL)handle forUpdate:(SUAppcastItem *)item state:(SPUUserUpdateState *)state {
  deferredNotice = !handle;
  if (deferredNotice) Emit("notice-deferred");
}
- (void)standardUserDriverWillFinishUpdateSession { deferredNotice = NO; }
- (BOOL)updater:(SPUUpdater *)updater shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item untilInvokingBlock:(void (^)(void))handler {
  pendingInstall = [handler copy];
  Emit("prepare-install");
  return YES;
}
- (void)updaterWillRelaunchApplication:(SPUUpdater *)updater { Emit("will-relaunch"); }
- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error { Emit("error"); }
@end
static MarchenUpdaterDelegate *delegate;

static napi_value Void(napi_env env) { napi_value result; napi_get_undefined(env, &result); return result; }
static bool Main(napi_env env) {
  if ([NSThread isMainThread]) return true;
  napi_throw_error(env, nullptr, "Sparkle 必须在 macOS 主线程调用"); return false;
}
static void CallEvent(napi_env env, napi_value callback, void *, void *data) {
  if (!env || !callback) return;
  napi_value value, receiver, result;
  napi_create_string_utf8(env, (const char *)data, NAPI_AUTO_LENGTH, &value);
  napi_get_undefined(env, &receiver);
  napi_call_function(env, receiver, callback, 1, &value, &result);
}
static napi_value Initialize(napi_env env, napi_callback_info info) {
  if (!Main(env)) return nullptr;
  if (controller) { napi_throw_error(env, nullptr, "Sparkle 已初始化"); return nullptr; }
  size_t count = 1; napi_value args[1]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  napi_valuetype type;
  if (count != 1 || napi_typeof(env, args[0], &type) != napi_ok || type != napi_function) {
    napi_throw_type_error(env, nullptr, "必须提供事件回调"); return nullptr;
  }
  napi_value label; napi_create_string_utf8(env, "MarchenSparkle", NAPI_AUTO_LENGTH, &label);
  napi_create_threadsafe_function(env, args[0], nullptr, label, 0, 1, nullptr, nullptr, nullptr, CallEvent, &events);
  napi_unref_threadsafe_function(env, events);
  delegate = [MarchenUpdaterDelegate new];
  controller = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:NO updaterDelegate:delegate userDriverDelegate:delegate];
  NSError *error = nil;
  if (![controller.updater startUpdater:&error]) {
    controller = nil; delegate = nil;
    napi_release_threadsafe_function(events, napi_tsfn_abort); events = nullptr;
    napi_throw_error(env, nullptr, error.localizedDescription.UTF8String); return nullptr;
  }
  return Void(env);
}
static napi_value Automatic(napi_env env, napi_callback_info info) {
  if (!Main(env)) return nullptr;
  size_t count = 1; napi_value args[1]; bool value;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count == 1) {
    if (napi_get_value_bool(env, args[0], &value) != napi_ok) {
      napi_throw_type_error(env, nullptr, "自动检查偏好必须是布尔值"); return nullptr;
    }
    controller.updater.automaticallyChecksForUpdates = value;
  }
  napi_value result; napi_get_boolean(env, controller.updater.automaticallyChecksForUpdates, &result); return result;
}
static napi_value Check(napi_env env, napi_callback_info info) {
  if (!Main(env)) return nullptr;
  [controller checkForUpdates:nil]; return Void(env);
}
static napi_value Background(napi_env env, napi_callback_info info) {
  if (!Main(env)) return nullptr;
  [controller.updater checkForUpdatesInBackground]; return Void(env);
}
static napi_value Resume(napi_env env, napi_callback_info info) {
  if (!Main(env)) return nullptr;
  // 仅保存成功后调用；失败时保留待执行 handler，允许用户显式重试。
  void (^handler)(void) = pendingInstall; pendingInstall = nil;
  if (handler) handler();
  return Void(env);
}
static napi_value SetPlaying(napi_env env, napi_callback_info info) {
  if (!Main(env)) return nullptr;
  size_t count = 1; napi_value args[1]; bool value;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 1 || napi_get_value_bool(env, args[0], &value) != napi_ok) {
    napi_throw_type_error(env, nullptr, "播放状态必须是布尔值"); return nullptr;
  }
  playing = value;
  if (!playing && deferredNotice) { deferredNotice = NO; [controller checkForUpdates:nil]; }
  return Void(env);
}
static void Cleanup(void *) {
  pendingInstall = nil; controller = nil; delegate = nil;
  if (events) { napi_release_threadsafe_function(events, napi_tsfn_abort); events = nullptr; }
}
static napi_value Register(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"initialize", nullptr, Initialize, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"checkForUpdates", nullptr, Check, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"automaticChecks", nullptr, Automatic, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"checkInBackground", nullptr, Background, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"resumeInstall", nullptr, Resume, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setPlaying", nullptr, SetPlaying, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 6, properties);
  napi_add_env_cleanup_hook(env, Cleanup, nullptr);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Register)
