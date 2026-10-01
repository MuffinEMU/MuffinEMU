// Force-included ahead of Common/precompiled.h. Boost.Predef does not classify Apple targets
// as BOOST_OS_UNIX, and Common/socket.h keys the POSIX socket types on that macro.
#pragma once
#include <boost/predef.h>
#undef BOOST_OS_UNIX
#define BOOST_OS_UNIX 1
