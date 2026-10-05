#include "index.runtime.hpp"
#include <chrono>
#include <cstdio>
#include <exception>

void gea_xbox_top_level();
extern "C" void gea_cycle_collection_defer_begin();
extern "C" void gea_cycle_collection_defer_end();
namespace gea::framework::app::generated { void drainMicrotasks(); }
extern "C" bool gea_xbox_begin() {
  try {
    gea::configureAutomaticCycleCollection(std::chrono::milliseconds(100), 4 * 1024 * 1024, 65536, std::chrono::milliseconds(1600));
    gea_xbox_top_level();
    return true;
  } catch (const gea::Value &error) {
    try {
      std::fprintf(stderr, "[aviator] JavaScript initialization exception: %s\n", gea::dynamicToString(error).c_str());
    } catch (...) {
      std::fprintf(stderr, "[aviator] JavaScript initialization exception could not be converted to text\n");
    }
  } catch (const std::exception &error) {
    std::fprintf(stderr, "[aviator] startup: %s\n", error.what());
  } catch (...) {
    std::fprintf(stderr, "[aviator] startup threw a JavaScript exception\n");
  }
  return false;
}

extern "C" bool gea_xbox_frame() {
  // Defer cycle collection through this frame's microtasks, promise jobs, and animation callbacks.
  struct FrameScope {
    FrameScope() { gea_cycle_collection_defer_begin(); }
    ~FrameScope() { gea_cycle_collection_defer_end(); }
  } scope;
  try {
    const double now = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();
    gea::framework::app::generated::drainMicrotasks();
    gea::detail::drainPromiseJobs();
    gea::host::runAnimationFrameCallbacks(now);
    gea::framework::app::generated::drainMicrotasks();
    gea::detail::drainPromiseJobs();
    return true;
  } catch (const std::exception &error) {
    std::fprintf(stderr, "[aviator] frame: %s\n", error.what());
  } catch (const gea::Value &error) {
    try {
      std::fprintf(stderr, "[aviator] JavaScript frame exception: %s\n", gea::dynamicToString(error).c_str());
    } catch (...) {
      std::fprintf(stderr, "[aviator] JavaScript frame exception could not be converted to text\n");
    }
  } catch (...) {
    std::fprintf(stderr, "[aviator] frame threw a JavaScript exception\n");
  }
  return false;
}
