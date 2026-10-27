#include "cef_application.h"
#include "command_channel.h"
#include "include/cef_app.h"

#include <filesystem>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>
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

}  // namespace

int main(int argc, char* argv[]) {
  CefMainArgs main_args(argc, argv);
  std::cerr << "[groubot-cef] start" << std::endl;
  const auto exit_code = CefExecuteProcess(main_args, nullptr, nullptr);
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
  CefApplication* application = nullptr;
  CommandChannel channel([&application](const std::string& command, const std::string& value) {
    if (application) application->HandleCommand(command, value);
  });
  auto app = new CefApplication(&channel);
  application = app;
  std::cerr << "[groubot-cef] initialize" << std::endl;
  if (!CefInitialize(main_args, settings, app, nullptr)) return CefGetExitCode();
  std::cerr << "[groubot-cef] initialized" << std::endl;
  channel.Start();
  CefRunMessageLoop();
  CefShutdown();
  if (display) {
    XDestroyWindow(display, parent_window);
    XCloseDisplay(display);
  }
  return 0;
}
