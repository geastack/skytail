// Skytail desktop driver for Windows: a plain Win32 window rendered through
// the native WebGL host on threejs-rendozer (GLES on rendozer's DX12 backend).
//
// The generated game and the WebGL/audio hosts are the same ones the Xbox
// build uses (xbox/three_runtime.cpp provides gea_xbox_begin/gea_xbox_frame);
// this file replaces the CoreWindow driver with an HWND, a message loop,
// keyboard/mouse input and XInput gamepads.
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <windowsx.h>
#include <xinput.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>

// DirectX Agility SDK: rendozer's DX12 backend needs D3D12Core.dll from
// .\d3d12\ next to the executable.
extern "C" {
__declspec(dllexport) extern const UINT D3D12SDKVersion = 619;
__declspec(dllexport) extern const char *D3D12SDKPath = ".\\d3d12\\";
}

extern "C" bool gea_three_webgl_attach_uwp(void *, double, double, double);
extern "C" void gea_three_webgl_update_size_uwp(double, double, double);
extern "C" bool gea_three_webgl_begin_frame_uwp();
extern "C" void gea_three_webgl_end_frame_uwp();
extern "C" void gea_three_audio_set_directory_uwp(const wchar_t *);
extern "C" void gea_three_set_key_state(int code, bool down);
extern "C" void gea_three_set_pointer_state(double x, double y, double width, double height, bool down);
extern "C" bool gea_xbox_begin();
extern "C" bool gea_xbox_frame();

static double gamepadState[8]{};
extern "C" double gea_three_gamepad_state(double channel) {
  const int index = static_cast<int>(channel);
  return index >= 0 && index < 8 ? gamepadState[index] : 0.0;
}

namespace {

bool gClosed = false;
bool gMinimized = false;
bool gPointerDown = false;
double gDpiScale = 1.0;

// The game reads keys by macOS virtual key code (the AppKit host's table).
int macKeyCode(WPARAM vk) {
  switch (vk) {
  case VK_LEFT: return 123;
  case VK_RIGHT: return 124;
  case VK_DOWN: return 125;
  case VK_UP: return 126;
  case VK_SPACE: return 49;
  case VK_RETURN: return 36;
  case VK_ESCAPE: return 53;
  case VK_TAB: return 48;
  case VK_BACK: return 51;
  case VK_SHIFT: case VK_LSHIFT: case VK_RSHIFT: return 56;
  case VK_CONTROL: case VK_LCONTROL: case VK_RCONTROL: return 59;
  case VK_MENU: case VK_LMENU: case VK_RMENU: return 58;
  default: break;
  }
  static const int letters[26] = {
    0 /*A*/, 11 /*B*/, 8 /*C*/, 2 /*D*/, 14 /*E*/, 3 /*F*/, 5 /*G*/, 4 /*H*/, 34 /*I*/, 38 /*J*/, 40 /*K*/, 37 /*L*/, 46 /*M*/,
    45 /*N*/, 31 /*O*/, 35 /*P*/, 12 /*Q*/, 15 /*R*/, 1 /*S*/, 17 /*T*/, 32 /*U*/, 9 /*V*/, 13 /*W*/, 7 /*X*/, 16 /*Y*/, 6 /*Z*/,
  };
  if (vk >= 'A' && vk <= 'Z') return letters[vk - 'A'];
  static const int digits[10] = {29, 18, 19, 20, 21, 23, 22, 26, 28, 25};
  if (vk >= '0' && vk <= '9') return digits[vk - '0'];
  return -1;
}

void clientPixels(HWND hwnd, int &width, int &height) {
  RECT rc{};
  GetClientRect(hwnd, &rc);
  width = std::max<int>(1, rc.right - rc.left);
  height = std::max<int>(1, rc.bottom - rc.top);
}

void reportPointer(HWND hwnd, LPARAM lParam) {
  int width = 0, height = 0;
  clientPixels(hwnd, width, height);
  // The game works in CSS pixels, like the AppKit host's points.
  gea_three_set_pointer_state(GET_X_LPARAM(lParam) / gDpiScale, GET_Y_LPARAM(lParam) / gDpiScale, width / gDpiScale,
                              height / gDpiScale, gPointerDown);
}

void updateSize(HWND hwnd) {
  int width = 0, height = 0;
  clientPixels(hwnd, width, height);
  gea_three_webgl_update_size_uwp(width, height, gDpiScale);
}

LRESULT CALLBACK windowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
  switch (message) {
  case WM_CLOSE:
    gClosed = true;
    DestroyWindow(hwnd);
    return 0;
  case WM_DESTROY:
    PostQuitMessage(0);
    return 0;
  case WM_SIZE:
    gMinimized = wParam == SIZE_MINIMIZED;
    if (!gMinimized) updateSize(hwnd);
    return 0;
  case WM_DPICHANGED: {
    gDpiScale = HIWORD(wParam) / 96.0;
    const RECT *suggested = reinterpret_cast<const RECT *>(lParam);
    SetWindowPos(hwnd, nullptr, suggested->left, suggested->top, suggested->right - suggested->left,
                 suggested->bottom - suggested->top, SWP_NOZORDER | SWP_NOACTIVATE);
    return 0;
  }
  case WM_KEYDOWN:
  case WM_SYSKEYDOWN:
    if (wParam == VK_F4 && (GetKeyState(VK_MENU) & 0x8000)) break;
    if (int code = macKeyCode(wParam); code >= 0) gea_three_set_key_state(code, true);
    return 0;
  case WM_KEYUP:
  case WM_SYSKEYUP:
    if (int code = macKeyCode(wParam); code >= 0) gea_three_set_key_state(code, false);
    return 0;
  case WM_KILLFOCUS:
    for (int code = 0; code < 256; ++code) gea_three_set_key_state(code, false);
    return 0;
  case WM_MOUSEMOVE:
    reportPointer(hwnd, lParam);
    return 0;
  case WM_LBUTTONDOWN:
    gPointerDown = true;
    SetCapture(hwnd);
    reportPointer(hwnd, lParam);
    return 0;
  case WM_LBUTTONUP:
    gPointerDown = false;
    ReleaseCapture();
    reportPointer(hwnd, lParam);
    return 0;
  case WM_ERASEBKGND:
    return 1;
  default:
    break;
  }
  return DefWindowProcW(hwnd, message, wParam, lParam);
}

void pollGamepad() {
  for (double &value : gamepadState) value = 0.0;
  for (DWORD index = 0; index < XUSER_MAX_COUNT; ++index) {
    XINPUT_STATE state{};
    if (XInputGetState(index, &state) != ERROR_SUCCESS) continue;
    const XINPUT_GAMEPAD &pad = state.Gamepad;
    auto axis = [](SHORT value) {
      const double v = value / 32767.0;
      return std::fabs(v) < 0.12 ? 0.0 : std::max(-1.0, std::min(1.0, v));
    };
    gamepadState[0] = 1.0;
    gamepadState[1] = axis(pad.sThumbLX);
    gamepadState[2] = -axis(pad.sThumbLY);
    const WORD buttons[] = {XINPUT_GAMEPAD_A, XINPUT_GAMEPAD_B, XINPUT_GAMEPAD_Y, XINPUT_GAMEPAD_DPAD_DOWN,
                            XINPUT_GAMEPAD_DPAD_LEFT};
    for (int i = 0; i < 5; ++i) gamepadState[i + 3] = (pad.wButtons & buttons[i]) ? 1.0 : 0.0;
    return;
  }
}

std::wstring exeDirectory() {
  wchar_t path[MAX_PATH] = {};
  GetModuleFileNameW(nullptr, path, MAX_PATH);
  std::wstring dir(path);
  const size_t slash = dir.find_last_of(L"\\/");
  return slash == std::wstring::npos ? L"." : dir.substr(0, slash);
}

void setDefaultEnv(const wchar_t *name, const std::wstring &value) {
  wchar_t existing[4];
  if (GetEnvironmentVariableW(name, existing, 4) > 0) return;
  SetEnvironmentVariableW(name, value.c_str());
  // The hosts read some settings through the CRT environment.
  _wputenv_s(name, value.c_str());
}

void fail(const wchar_t *message) {
  std::fwprintf(stderr, L"[skytail] %ls\n", message);
  if (!GetEnvironmentVariableW(L"SKYTAIL_NO_DIALOGS", nullptr, 0)) {
    MessageBoxW(nullptr, message, L"Skytail", MB_OK | MB_ICONERROR);
  }
}

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int showCommand) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  const std::wstring dir = exeDirectory();
  SetCurrentDirectoryW(dir.c_str());

  // The WebGL host loads EGL/GLES from these; GeaRendozerGLES.dll implements both.
  const std::wstring gles = dir + L"\\GeaRendozerGLES.dll";
  setDefaultEnv(L"GEA_ANGLE_EGL_DYLIB", gles);
  setDefaultEnv(L"GEA_ANGLE_GLES_DYLIB", gles);
  // No display link paces this loop; present with vsync.
  setDefaultEnv(L"GEA_ANGLE_SWAP_INTERVAL", L"1");
  // Logs go next to the executable (a double-clicked GUI app has no console).
  setDefaultEnv(L"GEA_THREE_ANGLE_SMOKE_LOG", dir + L"\\skytail.log");

  WNDCLASSEXW wc{};
  wc.cbSize = sizeof wc;
  wc.style = CS_HREDRAW | CS_VREDRAW | CS_OWNDC;
  wc.lpfnWndProc = windowProc;
  wc.hInstance = instance;
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  wc.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(1));
  wc.lpszClassName = L"GeaSkytailWindow";
  RegisterClassExW(&wc);

  // 1280x720 client area, centred on the primary monitor.
  const UINT dpi = GetDpiForSystem();
  gDpiScale = dpi / 96.0;
  RECT rect{0, 0, static_cast<LONG>(1280 * gDpiScale), static_cast<LONG>(720 * gDpiScale)};
  const DWORD style = WS_OVERLAPPEDWINDOW;
  AdjustWindowRectExForDpi(&rect, style, FALSE, 0, dpi);
  const int width = rect.right - rect.left, height = rect.bottom - rect.top;
  const int x = std::max(0, (GetSystemMetrics(SM_CXSCREEN) - width) / 2);
  const int y = std::max(0, (GetSystemMetrics(SM_CYSCREEN) - height) / 2);
  HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"Skytail", style, x, y, width, height, nullptr, nullptr, instance,
                              nullptr);
  if (!hwnd) {
    fail(L"Could not create the game window.");
    return 1;
  }
  gDpiScale = GetDpiForWindow(hwnd) / 96.0;
  ShowWindow(hwnd, showCommand == SW_HIDE ? SW_SHOWNORMAL : showCommand);
  UpdateWindow(hwnd);

  const std::wstring sounds = dir + L"\\Sounds";
  gea_three_audio_set_directory_uwp(sounds.c_str());

  int clientWidth = 0, clientHeight = 0;
  clientPixels(hwnd, clientWidth, clientHeight);
  if (!gea_three_webgl_attach_uwp(hwnd, clientWidth, clientHeight, gDpiScale)) {
    fail(L"Could not start the renderer. See skytail.log next to Skytail.exe.");
    return 1;
  }
  if (!gea_xbox_begin()) {
    fail(L"The game failed to initialize. See skytail.log next to Skytail.exe.");
    return 1;
  }

  MSG msg{};
  while (!gClosed) {
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
      if (msg.message == WM_QUIT) gClosed = true;
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    if (gClosed) break;
    if (gMinimized) {
      WaitMessage();
      continue;
    }
    pollGamepad();
    bool frameOk = false;
    {
      struct ContextScope {
        ~ContextScope() { gea_three_webgl_end_frame_uwp(); }
      } contextScope;
      frameOk = gea_three_webgl_begin_frame_uwp() && gea_xbox_frame();
    }
    if (!frameOk) {
      fail(L"The game stopped because a frame failed. See skytail.log next to Skytail.exe.");
      return 1;
    }
  }
  return 0;
}
