cmake_minimum_required(VERSION 3.21)
project(groubot_cef_test LANGUAGES C CXX)

set(CEF_ROOT "/tmp/cef-test-156.0.14/cef_binary_156.0.14+g4fa4ab5+chromium-156.0.8078.48_linux64_minimal" CACHE PATH "CEF binary distribution")
set(CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)

add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}" libcef_dll_wrapper)

add_executable(groubot-cef-test cef_test.cc)
target_compile_features(groubot-cef-test PRIVATE cxx_std_20)
target_compile_definitions(groubot-cef-test PRIVATE CEF_USE_SANDBOX=0)
target_include_directories(groubot-cef-test PRIVATE "${CEF_INCLUDE_PATH}")
target_link_libraries(groubot-cef-test PRIVATE libcef_dll_wrapper ${CEF_LIB_RELEASE} X11 pthread dl)

set_target_properties(groubot-cef-test PROPERTIES
  BUILD_RPATH "${CEF_BINARY_DIR_RELEASE}"
  INSTALL_RPATH "${CEF_BINARY_DIR_RELEASE}"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release"
)

add_custom_command(TARGET groubot-cef-test POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${CEF_LIB_RELEASE}" "$<TARGET_FILE_DIR:groubot-cef-test>/libcef.so"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${CEF_BINARY_DIR_RELEASE}" "$<TARGET_FILE_DIR:groubot-cef-test>"
)

foreach(CEF_RESOURCE chrome_100_percent.pak chrome_200_percent.pak resources.pak icudtl.dat)
  add_custom_command(TARGET groubot-cef-test POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      "${CEF_RESOURCE_DIR}/${CEF_RESOURCE}"
      "$<TARGET_FILE_DIR:groubot-cef-test>/${CEF_RESOURCE}")
endforeach()
add_custom_command(TARGET groubot-cef-test POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_directory
    "${CEF_RESOURCE_DIR}/locales"
    "$<TARGET_FILE_DIR:groubot-cef-test>/locales")

message(STATUS "CEF version: ${CEF_VERSION}")
message(STATUS "CEF Chromium version: ${CEF_CHROMIUM_VERSION}")
