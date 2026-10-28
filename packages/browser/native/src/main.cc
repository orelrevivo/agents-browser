#include "cef_application.h"
#include "cef_render_process_handler.h"
#include "command_channel.h"
#include "include/cef_app.h"

#include <filesystem>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>
#include <atomic>
#include <chrono>
#include <thread>
#include <X11/Xlib.h>

namespace {

std::string Argument(int argc, char* argv[], std::string_view name) {
  const std::string prefix = "--" + std::string(name) + "=";
  for (int index = 1; index < argc; ++index) {
    const std::string value = argv[index];
    if (value.rfind(prefix, 0) == 0) return value.substr(prefix.size());
  }
  return {};
}

// Minimal app for CEF subprocesses. It only installs the renderer-side
// bridge (window.groubotNative / page evaluation) and avoids the browser-only
// behaviour of CefApplication that breaks child bootstrap on CEF 156.
class RendererApp final : public CefApp {
 public:
  CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override { return handler_; }

 private:
  CefRefPtr<GroubotRenderProcessHandler> handler_ = new GroubotRenderProcessHandler();
  IMPLEMENT_REFCOUNTING(RendererApp);
};

}  // namespace

int main(int argc, char* argv[]) {
  XInitThreads();
  CefMainArgs main_args(argc, argv);
  CefApplication* application = nullptr;
  CommandChannel channel([&application](const std::string& command, const std::string& value) {
    if (application) application->HandleCommand(command, value);
  });
  CefRefPtr<CefApplication> app = new CefApplication(&channel, argc, argv);
  application = app.get();
  std::cerr << "[groubot-cef] start" << std::endl;
  // Subprocesses must use the minimal CEF bootstrap. The full application
  // object is installed for the browser process after CefExecuteProcess;
  // passing it here causes CEF 156's child bootstrap to fail before ICU is
  // initialized on some Linux installations.
  CefRefPtr<RendererApp> subprocess_app = new RendererApp();
  const auto exit_code = CefExecuteProcess(main_args, subprocess_app, nullptr);
  std::cerr << "[groubot-cef] execute-process-returned " << exit_code << std::endl;
  if (exit_code >= 0) return exit_code;

  Display* display = nullptr;
  Window parent_window = static_cast<Window>(std::strtoull(Argument(argc, argv, "parent-window").c_str(), nullptr, 10));
  if (!parent_window) {
    display = XOpenDisplay(nullptr);
    if (!display) {
      std::cerr << "[groubot-cef] unable-to-open-x11-display" << std::endl;
      return 1;
    }
    parent_window = XCreateSimpleWindow(display, DefaultRootWindow(display), 100, 100, 1440, 900, 0, 0, 0);
    XStoreName(display, parent_window, "Groubot");
    XSelectInput(display, parent_window, ExposureMask | StructureNotifyMask | KeyPressMask | ButtonPressMask);
    XMapWindow(display, parent_window);
    XFlush(display);
    setenv("GROUBOT_CEF_PARENT_WINDOW", std::to_string(parent_window).c_str(), 1);
  }

  CefSettings settings;
  std::cerr << "[groubot-cef] settings-created" << std::endl;
  settings.no_sandbox = true;
  settings.log_severity = LOGSEVERITY_WARNING;
  const auto root_cache = Argument(argc, argv, "root-cache");
  const auto resources = Argument(argc, argv, "resources");
  const auto locales = Argument(argc, argv, "locales");
  if (!root_cache.empty()) {
    std::filesystem::create_directories(root_cache);
    CefString(&settings.root_cache_path) = root_cache;
  }
  if (!resources.empty()) CefString(&settings.resources_dir_path) = resources;
  if (!locales.empty()) CefString(&settings.locales_dir_path) = locales;
  std::cerr << "[groubot-cef] initialize" << std::endl;
  if (!CefInitialize(main_args, settings, app, nullptr)) return CefGetExitCode();
  std::cerr << "[groubot-cef] initialized" << std::endl;
  channel.Start();
  std::atomic_bool resize_watcher_running{true};
  Display* resize_display = XOpenDisplay(nullptr);
  std::thread resize_watcher([&application, &resize_watcher_running, resize_display, parent_window]() {
    if (!resize_display || !parent_window) return;
    XSelectInput(resize_display, parent_window, StructureNotifyMask);
    while (resize_watcher_running.load()) {
      while (XPending(resize_display) > 0) {
        XEvent event{};
        XNextEvent(resize_display, &event);
        if (event.type == ConfigureNotify && event.xconfigure.width > 0 && event.xconfigure.height > 0) {
          const auto value = std::to_string(event.xconfigure.x) + "\t" +
                             std::to_string(event.xconfigure.y) + "\t" +
                             std::to_string(event.xconfigure.width) + "\t" +
                             std::to_string(event.xconfigure.height);
          if (application) application->HandleCommand("RESIZE", value);
        }
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(30));
    }
  });
  CefRunMessageLoop();
  resize_watcher_running.store(false);
  if (resize_watcher.joinable()) resize_watcher.join();
  if (resize_display) XCloseDisplay(resize_display);
  CefShutdown();
  if (display) {
    XDestroyWindow(display, parent_window);
    XCloseDisplay(display);
  }
  return 0;
}
