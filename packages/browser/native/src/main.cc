#include "cef_application.h"
#include "command_channel.h"
#include "include/cef_app.h"

#include <filesystem>
#include <iostream>
#include <string>
#include <string_view>

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
  return 0;
}
