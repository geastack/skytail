cmake_minimum_required(VERSION 3.24)
project(GeaAviatorNative LANGUAGES CXX)

# The CoreWindow driver requires C++/CX. MSBuild compiles it separately with MSVC and /ZW.
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/generated-sources.txt" APP_SOURCES)
if(NOT APP_SOURCES)
  message(FATAL_ERROR "No generated C++: run node xbox/build-xbox.mjs --stage-only from the project root")
endif()
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/framework-includes.txt" FRAMEWORK_INCLUDES)
list(TRANSFORM FRAMEWORK_INCLUDES PREPEND "${CMAKE_CURRENT_SOURCE_DIR}/")
set(HOST_SOURCES
  native/angle_webgl_host.mm
  native/audio_host.mm
  framework/host/host/timers.cpp
  three_runtime.cpp)
set_source_files_properties(${HOST_SOURCES} PROPERTIES LANGUAGE CXX SKIP_PRECOMPILE_HEADERS ON)
add_library(aviator_native STATIC ${APP_SOURCES} ${HOST_SOURCES})
target_compile_features(aviator_native PRIVATE cxx_std_20)
target_compile_definitions(aviator_native PRIVATE NOMINMAX _USE_MATH_DEFINES _CRT_SECURE_NO_WARNINGS
  WINAPI_FAMILY=WINAPI_FAMILY_APP _WIN32_WINNT=0x0A00)
target_compile_options(aviator_native PRIVATE /bigobj /EHsc /MD /O2 /W0)
target_include_directories(aviator_native PRIVATE generated native ${FRAMEWORK_INCLUDES})
target_precompile_headers(aviator_native PRIVATE generated/index.hpp)
