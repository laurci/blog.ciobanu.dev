---
title: "An elf and a spider walked into a bar."
excerpt: "F*ck nextjs. Let's hand-write a website in x86 machine code. To prove a point."
coverImage: "/assets/blog/elves-and-css/cover.png"
date: "2024-11-05T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/elves-and-css/cover.png"
---

**WARNING**: this entire blog post is a rant.

So, [Next.js Conf](https://nextjs.org/conf) 2024 just happened, and I'm so mad. What the f\*ck happened to the web? What have we done? How much complexity can we f\*cking stack on top of this shit platform, and why do we have to solve everything with Javascript (this is a different rant)? 

Is this component rendered on the server or is it on the client? Or both? Should I `'use server'` or `'use client'`? Or neither? What's the default behaviour of `fetch` again? Does it cache?

Oh, and now we also have `'use cache'`?

![everything is fine](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXhldzJrbmI1ZWhibGVsZ3Nqdmt2NXk2bmRxY2l6NnpmNDJuZ3JiYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NTur7XlVDUdqM/giphy.webp)

I don't know if you can feel it, but my blood is boiling.

What the f\*ck would've been wrong with `import {fetchAndCache} from "next/fetch";`? Why change the way `fetch` (a global __AND__ a web standard) works by default? This is spooky magic, not in the good way. Oh, and after the backlash, we change it again, to do the exact opposite by default?

I'm getting mad just by thinking about the comments for this post __"It's very simple bro, you're too stupid to understand."__.

You want simple? I'll show you f\*cking simple. Actually, I'll show you the bare minimum.

## ground rules

So, I want to make a very simple static website, with some text, some styling and a link you can click on. Also, it has to be accesible from a regular browser and over the internet.

But, here's the twist, I want to have the absolute minimum number of dependencies. The only dependency I'll accept is a POSIX compatible OS (we'll go for Linux). That means no fancy frameworks, no libraries, not even the `stdlib`. How do we get there?

[Here's the result of this blog post.](https://elves-and-css.ciobanu.dev)

## static websites, the web and HTTP

The first thing we need to figure out is what qualifies as a "website" for a browser. And the answer to that is very simple, a webite (or webpage, call it however you want) is just an HTML document. So, for our very simple static website we just need to create an HTML document, add styles inline (for simplicity) and a simple `<a href="...">` tag for the link.

Now, that we have something that can be opened by a browser, how do we access it from the internet?

Let's say you want to go to `blog.ciobanu.dev`. You type `blog.ciobanu.dev` in the address bar of your browser (or you follow a link) and press the return key on your keyboard. What happens next?

You and I (humans in general) refer to websites and services by their domain name, while the internet only cares about IP addresses. So, the first thing your browser needs to do, is find out where `blog.ciobanu.dev` is. This process is called __domain name resolution__ and is done with something called __DNS__. I won't go into details now (we're more interested about what comes next), but you can imagine that DNS is similar to a giant phone book that knows the IP address for every registered domain and subdomain.

Now that we have the IP address, the real fun begins. The browser acts as a __HTTP client__ and expects that it can connect to that IP on port 80 (443 for HTTPS) and speak to a __HTTP server__.

Hold on, hold on. What does it mean to connect to an IP on a port? Well, it can mean a lot of things, but in our case, it means we're going to talk about __TCP__.

TCP is a protocol; one of many. It defines a set of rules two computers follow to be able to talk to each other on the internet. One computer is called a __server__, it listens and waits for incoming connections from other computers, called __clients__. A client reaches out to a server to connect, and if the connection is succesful, a bi-directional stream is created. Both the client and the server can send and receive data to/from each other using this stream.

Hold on, hold on. So, an HTTP server is a TCP server and an HTTP client is a TCP client? And, if TCP is just a channel to send data back and forth, what are they actually sending?

I can sense the confusion. HTTP is just another protocol, that specifies what data HTTP servers/clients need to send to each other. Browsers expect those messages to be exchanged via TCP streams, but that doesn't mean that HTTP __requires__ TCP to work. TCP is just the transport.

The format for these messages are clearly defined in the [HTTP spec](https://datatracker.ietf.org/doc/html/rfc2616), but if you don't have two days to go through it, here's the gist of it.

Clients send __requests__ to servers, and servers send back __reponses__ in order. Both are encoded as text and follow a very simple format.

The request starts with the __request line__ that looks like this __`METHOD PATH HTTP/VERSION`__. The method is the action we want to perform (GET, POST, PUT, PATCH, DELETE, etc.), the path is the location of the resource we want to access, and at the end we specify the protocol version we want to use for this exchange.

When we load a webpage, the browser will make a `GET` request to the `/` path. There are multiple versions of the HTTP spec, but for our very simple use-case, we'll only have to comply to version `1.1`. Here's how the request line would look like `GET / HTTP/1.1`.

The request line and all other components of the request are ended by the new line sequence `\r\n` as specified by... the spec.

After that we have the __headers__. They contain metadata about the request. The format is __`Header-Name: value`__.

Following the headers is an empty new line and then the __request body__. It contains the actual data we want to transmit.

The response is very similar, the only meaningful difference is that instead of a request line, we have a __status line__ that looks somehting like this __`HTTP/VERSION STATUS_CODE STATUS_MESSAGE`__. The __status code__ represents the outcome of the response (success, failure, etc.). Here's a [list of standard status codes](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes) you might find in the wild.

Now, lets look at a complete exemple for our static website. Here's how the request might look like:

```txt
GET / HTTP/1.1
Host: elves-and-css.ciobanu.dev
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
# some more headers...
```

And here's how the respone might look like:

```txt
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 123
# some more headers...

<!DOCTYPE html>
<html>
    <head>
        <title>Elves and CSS</title>
        <style>
# some more html...
```

So, to recap, what we need is a TCP server that accepts connections, reads the request, sends back a static response and closes the connection. Now, lets see how low we can go.

## shallow waters

I know, I know. I just complained about Javascript and now I'm going to use it. But, hear me out. Before we go to __C__, it's good for you to __SEE__ (hehe) a basic example of a TCP server.

Here's a simple TCP server in Node.js that listens on port 8080 and sends back a simple response to every request:

```javascript
const net = require('net');

const HTML = `
<!DOCTYPE html>
<html>
    <head>
        <title>Elves and CSS</title>
        <style>body { background-color: #f0f0f0; }</style>
    </head>
    <body>
        <h1>Elves and CSS</h1>
    </body>
</html>`.trim();

const RESPONSE = `
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: ${HTML.length}

${HTML}
`.trim().replace(/\n/g, '\r\n');

console.log(RESOPNSE);

const server = net.createServer((socket) => {
    socket.on('data', (data) => {
        const _request = data.toString(); // we don't need anything from the request, so ignore it
        socket.write(RESPONSE);
        socket.end();
    });
});

server.listen(8080, '0.0.0.0', () => {
    console.log('Server started on port 8080');
});
```

This very simple code creates a TCP server that listens on port 8080 and sends back a simple HTML response to every request. The response is hardcoded in the `HTML` variable and the `RESPONSE` variable is constructed by adding the status line and the headers to the HTML content.

To test it out, spin up node and run this code. You can then open a browser and go to [`http://localhost:8080`](http://localhost:8080) to see the page.

The thing to note here is that the response is static. It never changes, no matter what the request is. It's always exactly this text:

```txt
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 203

<!DOCTYPE html>
<html>
    <head>
        <title>Elves and CSS</title>
        <style>body { background-color: #f0f0f0; }</style>
    </head>
    <body>
        <h1>Elves and CSS</h1>
    </body>
</html>
```

This will be very handy for were we're going.

## stranded at __sea__ (hehe)

Let's take a look at the same example in C.

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#define PORT 8080

const char RESPONSE[] = "HTTP/1.1 200 OK\r\n"
                        "Content-Type: text/html\r\n"
                        "Content-Length: 138\r\n\r\n"
                        "<!DOCTYPE html>"
                        "<html>"
                        "<head>"
                        "<title>Elves and CSS</title>"
                        "<style>body { background-color: #f0f0f0; }</style>"
                        "</head>"
                        "<body>"
                        "<h1>Elves and CSS</h1>"
                        "</body>"
                        "</html>";

const int RESPONSE_LEN = sizeof(RESPONSE);

int main()
{
    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    int server_sock = socket(AF_INET, SOCK_STREAM, 0);

    bind(server_sock, (struct sockaddr *)&server_addr, sizeof(server_addr));
    listen(server_sock, 10);

    printf("Server started on port %d\n", PORT);

    char _request[1024]; // 1KB buffer for response
    while (1)
    {
        int client_sock = accept(server_sock, NULL, NULL);
        read(client_sock, _request, sizeof(_request)); // we ignore the request, but we still need to read it

        write(client_sock, RESPONSE, RESPONSE_LEN);

        close(client_sock);
    }

    close(server_sock);

    return 0;
}
```

So, to begin, we have the same static response, stored in a constant (and its length). Looking into the main function, the first thing we do is setup a `sockaddr_in` struct that will hold the server's address (were is the server listening from). We set the family to `AF_INET` (IPv4), the address to `INADDR_ANY` (listen on all interfaces) and the port to `8080`. When we set the port, we need to convert it from host byte order to network byte order (always big endian aka MSB first) with `htons`.

We continue by creating a socket with `socket(AF_INET, SOCK_STREAM, 0)`. The first argument specifies the address family, the second the socket type (in this case `SOCK_STREAM` for TCP) and the last one is the protocol (0 means auto).

After we have a socket, we bind it to the address we set earlier with `bind(...)` and then we start listening for incoming connections with `listen(...)`.

Now we can process incoming connections. We have an infinite loop that accepts a connection with `accept(...)` and reads the request into a buffer. We don't care about the request, so we just write the response back to the client with `write(...)` and then close the connection with `close(...)`.

To test it out, compile the code with `gcc -o server server.c` and run the executable. You can then open a browser and go to [`http://localhost:8080`](http://localhost:8080) to see the page.

This is pretty cool, also pretty deep right? But I told you when we started that we're not going to use any dependencies. None. NADA. And, yet, here I am including `stdio.h`, `stdlib.h`, `string.h`, `unistd.h` and `arpa/inet.h`. What's up with that?

THAT is the C standard library, in my case it's `glibc`. It's a collection of functions, macros and types that are used to interact with the POSIX system. It's a very minimal wrapper around syscalls provided by the linux kernel. But, it's alo a dependency other than the OS, and I won't have it.

## no safety net

So, what can we do? And alo, what are syscalls?

Syscalls are the way a program can interact with the kernel. They are the only way a program can ask the kernel to do something on its behalf (besides the file system, IOCTLs, char device drivers and some other stuff). It's like calling a kernel function from user space (our program), but without having direct access to kernel memory.

How does it work? If it's not safe to share memory, how can we pass arguments to these kernel functions?

While we don't have access to kernel stuff, it has access to our memory, open file descriptors, child processes, threads, and also to our registers. SO, here's what you have to do to make a syscall: prepare your data the way the kernel expects it, put it in registers acording to the syscall calling convention for your architecture, and then trigger the syscall with an interrupt. The kernel will stop your program, do the thing you asked for, and then return control to your program. Then you get the return value in a register acording to the syscall calling convention for your architecture.

Wow, wow, wow, hold on! What's a calling convention? What's a register? Weren't we talking about web stuff?

Yeah. Bear with me. I'm getting there. Let's make a simple hello world program in C that doesn't use the standard library.

First, this is how a standard hello world program looks like:

```c
#include <stdio.h>

int main()
{
    char *str = "Hello, World!\n";

    printf("%s", str);

    return 0;
}
```

Ok, now, let's get rid of `stdio.h` and `printf`. But to do that, we need to know what `printf` does. It's a function that writes formatted output to stdout. It's a wrapper around the `write` syscall. So, let's use `write` directly.

```c
#include <unistd.h>

int main()
{
    char *str = "Hello, World!\n";
    
    write(1, str, 13);
}
```

Let's focus on this line `write(1, str, 13);`. The first argument is the file descriptor (`1` is always stdout), the second is the buffer we want to write (a pointer to our string), and the third is the number of bytes we want to write (13, the length of our string).

Wasn't so bad, was it? Now, for the final push, let's get rid of the `unistd.h` include and libc entirely.

```c
int main()
{
    char *str = "Hello, World!\n";

    asm(
        "mov $1, %%rax\n"
        "mov $1, %%rdi\n"
        "mov %0, %%rsi\n"
        "mov $13, %%rdx\n"
        "syscall\n"
        :
        : "r"(str)
        : "%rax", "%rdi", "%rsi", "%rdx");

    return 0;
}
```

How many people have we lost just now? Stay with me please, we're almost there.

So, here's what's happening. We're using the `asm` keyword to write inline assembly. Our assembly doesn't do much, it just sets up the registers for the `write` syscall and then triggers it with `syscall`. We're using it just as a bridge to the kernel.

Let's take a look at the `mov` instructions in order, ignoring the first one. If you squint at it a little, you'll see that it's the same call to write we had before. The first argument is the file descriptor (1 for stdout), the second is the buffer we want to write (our string; %0 gets replaced by the address of `str`), and the third is the number of bytes we want to write (13). So, what's the first `mov` doing? All syscalls have a number, assigned to them. The number for `write` is 1. That's how the kernel knows what to do when we call `syscall`.

How do we know what data goes in which register? Well, that's the syscall calling convention. It's different for every architecture. What we did here is for x86_64. You can find the calling convention for your architecture [in this amazingly useful document](https://www.chromium.org/chromium-os/developer-library/reference/linux-constants/syscalls/), or in the kernel source code (you do you; I don't judge).

Right, back to the web stuff. We can now write a TCP server in C that doesn't use any dependencies. Here's how it looks:

```c
int syscall_1(int number, int arg1)
{
    int result;

    __asm__ volatile(
        "movl %1, %%eax\n"
        "movl %2, %%ebx\n"
        "int $0x80\n"
        "movl %%eax, %0\n"
        : "=r"(result)
        : "g"(number), "g"(arg1)
        : "%eax", "%ebx");

    return result;
}

int syscall_2(int number, int arg1, int arg2)
{
    int result;

    __asm__ volatile(
        "movl %1, %%eax\n"
        "movl %2, %%ebx\n"
        "movl %3, %%ecx\n"
        "int $0x80\n"
        "movl %%eax, %0\n"
        : "=r"(result)
        : "g"(number), "g"(arg1), "g"(arg2)
        : "%eax", "%ebx", "%ecx");

    return result;
}

int syscall_3(int number, int arg1, int arg2, int arg3)
{
    int result;

    __asm__ volatile(
        "movl %1, %%eax\n"
        "movl %2, %%ebx\n"
        "movl %3, %%ecx\n"
        "movl %4, %%edx\n"
        "int $0x80\n"
        "movl %%eax, %0\n"
        : "=r"(result)
        : "g"(number), "g"(arg1), "g"(arg2), "g"(arg3)
        : "%eax", "%ebx", "%ecx", "%edx");

    return result;
}

int syscall_4(int number, int arg1, int arg2, int arg3, int arg4)
{
    int result;

    __asm__ volatile(
        "movl %1, %%eax\n"
        "movl %2, %%ebx\n"
        "movl %3, %%ecx\n"
        "movl %4, %%edx\n"
        "movl %5, %%esi\n"
        "int $0x80\n"
        "movl %%eax, %0\n"
        : "=r"(result)
        : "g"(number), "g"(arg1), "g"(arg2), "g"(arg3), "g"(arg4)
        : "%eax", "%ebx", "%ecx", "%edx", "%esi");

    return result;
}

#define SYS_READ 0x03
#define SYS_WRITE 0x04
#define SYS_CLOSE 0x06
#define SYS_SOCKET 0x167
#define SYS_BIND 0x169
#define SYS_LISTEN 0x16b
#define SYS_ACCEPT4 0x16c

void _start()
{

    const char RESPONSE[] = "HTTP/1.1 200 OK\r\n"
                            "Content-Type: text/html\r\n"
                            "Content-Length: 154\r\n\r\n"
                            "<!DOCTYPE html>"
                            "<html>"
                            "<head>"
                            "<title>Elves and CSS</title>"
                            "<style>body { background-color: #f0f0f0; }</style>"
                            "</head>"
                            "<body>"
                            "<h1>Elves and CSS</h1>"
                            "</body>"
                            "</html>";

    int server_sock = syscall_3(SYS_SOCKET, 2, 1, 0); // socket(AF_INET, SOCK_STREAM, 0)

    char server_addr[] = {
        0x02, 0x00,                                    // AF_INET
        0x1f, 0x90,                                    // htons(8080)
        0x00, 0x00, 0x00, 0x00,                        // INADDR_ANY
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 // padding
    };

    syscall_3(SYS_BIND, server_sock, &server_addr, 16); // bind(server_sock, &server_addr, sizeof(server_addr))
    syscall_2(SYS_LISTEN, server_sock, 10);             // listen(server_sock, 10)

    syscall_3(SYS_WRITE, 1, "Server started on port 8080\n", 29); // write(1, "Server started on port 8080\n", 27)

    char _request[1024];
    while (1)
    {
        int client_sock = syscall_4(SYS_ACCEPT4, server_sock, 0, 0, 0);    // accept4(server_sock, NULL, NULL, 0)
        syscall_3(SYS_READ, client_sock, _request, sizeof(_request));      // read(client_sock, _request, sizeof(_request))
        syscall_3(SYS_WRITE, client_sock, RESPONSE, sizeof(RESPONSE) - 1); // write(client_sock, RESPONSE,  sizeof(RESPONSE) - 1)
        syscall_1(SYS_CLOSE, client_sock);                                 // close(client_sock)
    }
}
```

Here's what changed:

- I switched from x86_64 to x86 (32-bit) because it will make my life easier. The only differences are the registers, the syscall numbers, and the `int 0x80` instruction instead of the `syscall` instruction.
- I added a few helper functions to make syscalls (one for 1 argument, one for 2 arguments, one for 3 arguments, and one for 4 arguments).
- I replaced the `socket`, `bind`, `listen`, `accept`, `read`, `write`, and `close` functions with syscalls.
- Instead of using the `sockaddr_in` struct, I'm using a byte array to represent the server address. This is because I don't have access to the `struct sockaddr_in` type, and this byte representation will help us more anyway.
- We don't have `libc` anymore, so we can't use `main`. Instead, we have `_start`, which is the entry point for the program. It's the first thing that gets executed when the program is run.

Take a moment to appreciate the beauty of this code. It's a TCP server that doesn't use any dependencies. It's just a few lines of code that interact directly with the kernel. It's the bare minimum.

## or is it?

Oh man, what now? My head hurts. I'm tired. I'm done. I'm going to bed. We don't have any dependencies, we don't have any libraries, we don't have any frameworks. Why isn't this blog post over?

Your head hurts? Drink your water. Let's continue.

When most people think of dependencies, they think of libraries, frameworks, maybe the OS. All of there are runtime dependencies. But, there's another kind of dependency, a build-time dependency. This is something you need to build your program, but you don't need it to run it. A compiler is a build-time dependency. You need it to turn your C code into machine code, but you don't need it to run the machine code. Our server depends on the C language and a C compiler, and I won't have it.

We'll rewrite the server in x86 assembly. Ready? Hereeeee weeeee goooooooo.

Let's start again with the hello world.

```asm
section .data
    msg db 'hello world', 0xa ; 0xa is the newline character
    len equ $ - msg

section .text
global _start

_start:
    ; write(1, msg, len)
    mov eax, 4                 ; write syscall number is 4
    mov ebx, 1                 ; file descriptor 1 is stdout
    mov ecx, msg               ; pointer to the message string
    mov edx, len               ; length of the message
    int 0x80                   ; make the syscall

    ; exit(0)
    mov eax, 1                 ; exit syscall number is 1
    mov ebx, 0               ; exit code 0
    int 0x80                   ; make the syscall
```

So, what's aseembly? It's a low-level programming language that's a step above machine code. It's a human-readable representation of machine code. Each instruction in assembly corresponds to a single machine code instruction. It's a very simple language, but it's also very powerful. You have complete control over the CPU and memory. You can do anything you want.

In this example, we have two sections: `.data` and `.text`. The `.data` section is for readable/writeable data, and the `.text` section is for executable code. We have a message in the `.data` section and the code to write it to stdout in the `.text` section. The `global _start` line tells the linker that `_start` is the entry point for the program. `_start` is called a label.

We only use 2 instructions: the `mov` instruction to move data between registers, and the `int` instruction to trigger syscalls. And, let me tell you, there are almost every instruction we need to write a TCP server in assembly. We're only missing a way to loop, and we can do that with the `jmp` instruction.

Let's rewrite the TCP server in assembly.

```asm
section .data

RESPONSE:
    db 'HTTP/1.1 200 OK', 0xd, 0xa
    db 'Content-Type: text/html', 0xd, 0xa
    db 'Content-Length: 154', 0xd, 0xa, 0xd, 0xa
    db '<!DOCTYPE html>'
    db '<html>'
    db '<head>'
    db '<title>Elves and CSS</title>'
    db '<style>body { background-color: #f0f0f0; }</style>'
    db '</head>'
    db '<body>'
    db '<h1>Elves and CSS</h1>'
    db '</body>'
    db '</html>'
RESPONSE_LEN equ $ - RESPONSE

MSG_SERVER_STARTED:
    db 'Server started on port 8080', 0xa
MSG_SERVER_STARTED_LEN equ $ - MSG_SERVER_STARTED

SERVER_ADDR:
    dw 2                ; sin_family = AF_INET
    dw 0x961f           ; sin_port = htons(8080)
    dd 0x00000000       ; sin_addr = INADDR_ANY (0.0.0.0)
    times 8 db 0x00     ; padding to make it 16 bytes total

; variables
server_sock dd 0x00
client_sock dd 0x00
request_buffer times 1024 db 0x00

section .text
global _start

_start:
    ; socket(AF_INET, SOCK_STREAM, 0)
    mov eax, 0x167
    mov ebx, 2 ; AF_INET
    mov ecx, 1 ; SOCK_STREAM
    mov edx, 0
    int 0x80

    ; save the server socket
    mov [server_sock], eax

    ; bind(server_sock, SERVER_ADDR, 16)
    mov eax, 0x169
    mov ebx, [server_sock]
    mov ecx, SERVER_ADDR
    mov edx, 16
    int 0x80

    ; listen(server_sock, 10)
    mov eax, 0x16b
    mov ebx, [server_sock]
    mov ecx, 10
    int 0x80

    ; write(1, MSG_SERVER_STARTED, MSG_SERVER_STARTED_LEN)
    mov eax, 0x4
    mov ebx, 1
    mov ecx, MSG_SERVER_STARTED
    mov edx, MSG_SERVER_STARTED_LEN
    int 0x80

handle_conn:
    ; accept(server_sock, NULL, NULL)
    mov eax, 0x16c
    mov ebx, [server_sock]
    mov ecx, 0
    mov edx, 0
    mov esi, 0
    int 0x80

    ; save the client socket
    mov [client_sock], eax

    ; read(client_sock, request_buffer, 1024)
    mov eax, 0x3
    mov ebx, [client_sock]
    mov ecx, request_buffer
    mov edx, 1024
    int 0x80

    ; write(client_sock, RESPONSE, RESPONSE_LEN)
    mov eax, 0x4
    mov ebx, [client_sock]
    mov ecx, RESPONSE
    mov edx, RESPONSE_LEN
    int 0x80

    ; close(client_sock)
    mov eax, 0x6
    mov ebx, [client_sock]
    int 0x80

    ; loop back to accept another connection
    jmp handle_conn
```

Take a look at it. It's beautiful. It's simple. It's powerful. It's the bare minimum.

The code is almost a line by line translation of the C code. We have the same sections: `.data` for data, and `.text` for code. We have the same labels for the messages and the server address. We have the same syscalls. We have the same loop. It's the same program, but in assembly.

If you got to this point, I'm proud of you. You've seen the bottom of the rabbit hole. You've seen the bare metal. You've seen the essence of computing. Almost.

Any reasonable person would stop here. But here's the thing, I'm not reasonable, and this is not the absolute minimum. We can go lower. We can go deeper. We can go to the very bottom.

## Titan, do you copy?

An assembly program is a human-readable representation of machine code. It's a step above machine code. An assembler turns assembly code into machine code.

Wait, can we write the machine code directly? Well... yes. Of course we can. You could just open a text file and write each byte by hand. But, that's not very practical. You could also use a hex editor, but that has the same issues.

 So, here's what we'll do. We'll write a small utility in Rust to help us write machine code. It will have a simple API that allows us to write bytes to a buffer. We'll use this utility to write the machine code for our TCP server.

 Technically, isn't this a build-time dependency?. F\*ck you! This is my blog post. I tried writing the machine code by hand, and it's a pain to change, and also you wouldn't be able to understand anything. This is basically the same thing. So, let's do it.

