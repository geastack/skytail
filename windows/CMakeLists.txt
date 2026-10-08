cmake_minimum_required(VERSION 3.24)
project(GeaSkytailWindows LANGUAGES C CXX RC)

# Configured by windows/build-windows.ps1 (driven by build-windows.mjs):
#   SKYTAIL_APP        generated game C++ + WebGL/audio hosts (xbox/build-xbox.mjs --stage-only)
#   THREEJS_RENDOZER   EGL + GLES3 on rendozer
#   RENDOZER_ROOT      rendozer checkout (include/internal/external + data/{d3d12,dxc})
#   TOOLCHAIN          glslang + SPIRV-Cross install prefix
foreach(var SKYTAIL_APP THREEJS_RENDOZER RENDOZER_ROOT TOOLCHAIN)
  if(NOT ${var})
    message(FATAL_ERROR "${var} is not set: build through windows/build-windows.mjs")
  endif()
endforeach()
set(APP "${SKYTAIL_APP}")
set(RDZ "${RENDOZER_ROOT}")
set(GLES "${THREEJS_RENDOZER}/native")

set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Skytail")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Skytail")

# --- glslang + SPIRV-Cross, installed into toolchain/ by build-windows.ps1 ---
file(GLOB TOOLCHAIN_LIBS "${TOOLCHAIN}/lib/*.lib")
if(NOT TOOLCHAIN_LIBS)
  message(FATAL_ERROR "glslang/SPIRV-Cross are not installed in ${TOOLCHAIN}: build through windows/build-windows.mjs")
endif()

# --- rendozer: DX12 (and the Vulkan backend Windows always compiles in) ---
add_library(rendozer STATIC
  ${RDZ}/internal/core/core.c
  ${RDZ}/internal/core/core_winapi.c
  ${RDZ}/internal/core/thread_winapi.c
  ${RDZ}/internal/core/timer_winapi.c
  ${RDZ}/internal/fs/fs.c
  ${RDZ}/internal/fs/fs_windows.c
  ${RDZ}/internal/renderer/renderer.c
  ${RDZ}/internal/renderer/renderer_debug.c
  ${RDZ}/internal/renderer/renderer_vk.c
  ${RDZ}/internal/renderer/renderer_dx12.cpp
  ${RDZ}/internal/renderer/renderer_dx12_windows.cpp)
# RDZ_RETAIL compiles out the D3D12 debug layer; -DRENDOZER_DEBUG_LAYER=ON
# keeps it (THREEJS_RENDOZER_DEBUG=1 then enables it at runtime).
option(RENDOZER_DEBUG_LAYER "Keep rendozer's D3D12 debug layer support" OFF)
target_compile_definitions(rendozer PUBLIC NDEBUG=1 $<IF:$<BOOL:${RENDOZER_DEBUG_LAYER}>,RDZ_RETAIL=0,RDZ_RETAIL=1>
  RDZ_INCLUDE_SHADER_COMPILER=0 NOMINMAX
  WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
target_include_directories(rendozer PUBLIC ${RDZ}/include PRIVATE ${RDZ}/internal ${RDZ}/external)
target_compile_options(rendozer PRIVATE -w)
target_link_libraries(rendozer PUBLIC d3d12 dxgi dxguid user32 shell32 ole32)

# --- GeaRendozerGLES.dll: EGL + GLES3 on rendozer ---
add_library(GeaRendozerGLES SHARED
  ${GLES}/rdz_gles.cpp
  ${GLES}/rdz_gles_translate.cpp
  ${GLES}/rdz_gles_win32.cpp)
target_compile_features(GeaRendozerGLES PRIVATE cxx_std_17)
target_compile_options(GeaRendozerGLES PRIVATE /EHsc -Wno-everything)
target_include_directories(GeaRendozerGLES PRIVATE ${RDZ}/external/dxc ${TOOLCHAIN}/include)
target_link_libraries(GeaRendozerGLES PRIVATE rendozer ${TOOLCHAIN_LIBS} d3d12)

# --- gles_smoke.exe: threejs-rendozer's Windows smoke test ---
if(EXISTS "${THREEJS_RENDOZER}/test/gles_smoke_win32.cpp")
  add_executable(gles_smoke ${THREEJS_RENDOZER}/test/gles_smoke_win32.cpp)
  target_compile_features(gles_smoke PRIVATE cxx_std_17)
  add_dependencies(gles_smoke GeaRendozerGLES)
endif()

# --- Skytail.exe ---
if(NOT EXISTS "${APP}/generated-sources.txt")
  message(WARNING "No staged game in ${APP}: building GeaRendozerGLES only")
  return()
endif()
file(STRINGS "${APP}/generated-sources.txt" APP_SOURCES)
list(TRANSFORM APP_SOURCES PREPEND "${APP}/")
file(STRINGS "${APP}/framework-includes.txt" FRAMEWORK_INCLUDES)
list(TRANSFORM FRAMEWORK_INCLUDES PREPEND "${APP}/")
# Very large generated asset kits are constant-data initializers; optimizing
# one (earth-and-water, ~400 KB) took over 20 minutes for no runtime gain.
# They build unoptimized, so without the /O2 precompiled header.
set(DATA_SOURCES)
foreach(source ${APP_SOURCES})
  if(source MATCHES "src_kit_generated_")
    file(SIZE "${source}" source_size)
    if(source_size GREATER 200000)
      list(APPEND DATA_SOURCES "${source}")
    endif()
  endif()
endforeach()
set_source_files_properties(${DATA_SOURCES} PROPERTIES SKIP_PRECOMPILE_HEADERS ON
  COMPILE_OPTIONS "/Od;/FI${APP}/generated/index.hpp")
set(HOST_SOURCES
  ${APP}/native/angle_webgl_host.mm
  ${APP}/native/audio_host.mm
  ${APP}/framework/host/host/timers.cpp
  ${APP}/framework/host/host/worker.cpp
  ${APP}/three_runtime.cpp)
set_source_files_properties(${HOST_SOURCES} PROPERTIES LANGUAGE CXX SKIP_PRECOMPILE_HEADERS ON)
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/win32_main.cpp PROPERTIES SKIP_PRECOMPILE_HEADERS ON)
add_executable(Skytail WIN32 ${APP_SOURCES} ${HOST_SOURCES} win32_main.cpp skytail.rc)
target_compile_features(Skytail PRIVATE cxx_std_20)
target_compile_definitions(Skytail PRIVATE NOMINMAX _USE_MATH_DEFINES _CRT_SECURE_NO_WARNINGS _WIN32_WINNT=0x0A00 UNICODE _UNICODE)
target_compile_options(Skytail PRIVATE $<$<COMPILE_LANGUAGE:CXX>:/bigobj /EHsc /O2 /W0>)
target_include_directories(Skytail PRIVATE ${APP}/generated ${APP}/native ${FRAMEWORK_INCLUDES})
target_precompile_headers(Skytail PRIVATE ${APP}/generated/index.hpp)
target_link_libraries(Skytail PRIVATE xinput xaudio2 mfplat mfreadwrite mfuuid ole32 user32 gdi32 shell32 winmm)
add_dependencies(Skytail GeaRendozerGLES)
