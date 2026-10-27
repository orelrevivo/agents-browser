#include "command_channel.h"

#include <iostream>
#include <string>
#include <thread>

CommandChannel::CommandChannel(CommandHandler handler) : handler_(std::move(handler)) {}

void CommandChannel::Start() {
  std::thread([this]() {
    std::string line;
    while (std::getline(std::cin, line)) {
      const auto separator = line.find('\t');
      const auto command = line.substr(0, separator);
      const auto value = separator == std::string::npos ? std::string{} : line.substr(separator + 1);
      handler_(command, value);
      if (command == "CLOSE") break;
    }
  }).detach();
}

void CommandChannel::Send(const std::string& event, const std::string& value) {
  std::cout << event;
  if (!value.empty()) std::cout << '\t' << value;
  std::cout << std::endl;
}
