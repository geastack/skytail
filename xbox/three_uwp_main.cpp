#define NOMINMAX
#include <wrl.h>
#include <string>

using namespace Platform;
using namespace Windows::ApplicationModel::Core;
using namespace Windows::ApplicationModel::Activation;
using namespace Windows::UI::Core;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;
using namespace Windows::Graphics::Display;
using namespace Windows::Gaming::Input;

extern "C" bool gea_three_webgl_attach_uwp(void *, double, double, double);
extern "C" void gea_three_webgl_update_size_uwp(double, double, double);
extern "C" void gea_three_audio_set_directory_uwp(const wchar_t *);
extern "C" bool gea_xbox_begin();
extern "C" bool gea_xbox_frame();
extern "C" bool gea_three_webgl_begin_frame_uwp();
extern "C" void gea_three_webgl_end_frame_uwp();

static double gamepadState[8]{};
extern "C" double gea_three_gamepad_state(double channel) {
  const int index = static_cast<int>(channel);
  return index >= 0 && index < 8 ? gamepadState[index] : 0.0;
}

namespace GeaAviatorThree {
ref class App sealed : public IFrameworkView {
  bool closed = false;
  bool visible = true;
  bool ready = false;
  PropertySet^ surface = nullptr;
  int renderWidth = 3840, renderHeight = 2160;
  void activated(CoreApplicationView^, IActivatedEventArgs^) { CoreWindow::GetForCurrentThread()->Activate(); }
  void closing(CoreWindow^, CoreWindowEventArgs^) { closed = true; }
  void visibility(CoreWindow^, VisibilityChangedEventArgs^ event) { visible = event->Visible; }
  void resized(CoreWindow^ window, WindowSizeChangedEventArgs^) { updateSize(window); }
  void backRequested(Platform::Object^, BackRequestedEventArgs^ event) {
    // The game handles B through gamepad polling. Suppress the system back action.
    event->Handled = true;
  }

  double scale() {
    const double value = DisplayInformation::GetForCurrentView()->RawPixelsPerViewPixel;
    return value > 0.0 ? value : 1.0;
  }
  void updateSize(CoreWindow^ window) {
    const double ratio = scale();
    gea_three_webgl_update_size_uwp(renderWidth ? renderWidth : window->Bounds.Width * ratio,
                                    renderHeight ? renderHeight : window->Bounds.Height * ratio,
                                    renderWidth ? renderWidth / window->Bounds.Width : ratio);
  }
  void pollGamepad() {
    for (double &value : gamepadState) value = 0.0;
    const auto pads = Gamepad::Gamepads;
    if (pads->Size == 0) return;
    const auto reading = pads->GetAt(0)->GetCurrentReading();
    gamepadState[0] = 1.0;
    gamepadState[1] = reading.LeftThumbstickX;
    gamepadState[2] = -reading.LeftThumbstickY;
    const GamepadButtons buttons[] = { GamepadButtons::A, GamepadButtons::B, GamepadButtons::Y,
                                      GamepadButtons::DPadDown, GamepadButtons::DPadLeft };
    for (int i = 0; i < 5; ++i) gamepadState[i + 3] = (reading.Buttons & buttons[i]) == buttons[i] ? 1.0 : 0.0;
  }

public:
  virtual void Initialize(CoreApplicationView^ view) {
    view->Activated += ref new TypedEventHandler<CoreApplicationView^, IActivatedEventArgs^>(this, &App::activated);
  }
  virtual void SetWindow(CoreWindow^ window) {
    window->Closed += ref new TypedEventHandler<CoreWindow^, CoreWindowEventArgs^>(this, &App::closing);
    window->VisibilityChanged += ref new TypedEventHandler<CoreWindow^, VisibilityChangedEventArgs^>(this, &App::visibility);
    window->SizeChanged += ref new TypedEventHandler<CoreWindow^, WindowSizeChangedEventArgs^>(this, &App::resized);
    SystemNavigationManager::GetForCurrentView()->BackRequested +=
      ref new EventHandler<BackRequestedEventArgs^>(this, &App::backRequested);
    const std::wstring sounds = std::wstring(Windows::ApplicationModel::Package::Current->InstalledLocation->Path->Data()) + L"\\Sounds";
    gea_three_audio_set_directory_uwp(sounds.c_str());
    surface = ref new PropertySet();
    surface->Insert("EGLNativeWindowTypeProperty", window);
    surface->Insert("EGLRenderSurfaceSizeProperty", PropertyValue::CreateSize(Size(renderWidth, renderHeight)));
    const double ratio = scale();
    ready = gea_three_webgl_attach_uwp(reinterpret_cast<IInspectable *>(surface),
                                      renderWidth ? renderWidth : window->Bounds.Width * ratio,
                                      renderHeight ? renderHeight : window->Bounds.Height * ratio,
                                      renderWidth ? renderWidth / window->Bounds.Width : ratio);
    if (ready) ready = gea_xbox_begin();
    if (!ready) throw ref new FailureException("Skytail initialization failed");
  }
  virtual void Load(String^) {}
  virtual void Run() {
    auto window = CoreWindow::GetForCurrentThread();
    while (!closed) {
      window->Dispatcher->ProcessEvents(visible ? CoreProcessEventsOption::ProcessAllIfPresent
                                                : CoreProcessEventsOption::ProcessOneAndAllPending);
      if (closed || !visible) continue;
      pollGamepad();
      bool frameOk = false;
      {
        // Keep the graphics context bound through frame callbacks and deferred cycle collection.
        struct ContextScope {
          ~ContextScope() { gea_three_webgl_end_frame_uwp(); }
        } contextScope;
        frameOk = gea_three_webgl_begin_frame_uwp() && gea_xbox_frame();
      }
      if (!frameOk) throw ref new FailureException("Skytail frame failed");
    }
  }
  virtual void Uninitialize() {}
};

ref class AppSource sealed : public IFrameworkViewSource {
public:
  virtual IFrameworkView^ CreateView() { return ref new App(); }
};
}

[Platform::MTAThread]
int main(Platform::Array<Platform::String^>^) {
  CoreApplication::Run(ref new GeaAviatorThree::AppSource());
  return 0;
}
