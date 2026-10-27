#pragma once

#include <functional>
#include <string>

class CommandChannel {
 public:
  using CommandHandler = std::function<void(const std::string&, const std::string&)>;

  explicit CommandChannel(CommandHandler handler);
  void Start();
  void Send(const std::string& event, const std::string& value = {});

 private:
  CommandHandler handler_;
};
