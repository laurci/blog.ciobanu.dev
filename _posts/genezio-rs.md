---
title: "Running Rust on Genezio. You heard me right."
excerpt: "Doing things you're not supposed to is always exciting. In this blog post I'm exploring if it's possible to run Rust code on Genezio."
coverImage: "/assets/blog/genezio-rs/cover.png"
date: "2023-12-18T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/genezio-rs/cover.png"
---

## What the ...?

Lately, I've been playing more and more with [Genezio](https://genez.io/), and I have to admit, it kinda' grew on me. If you have no idea what I'm talking about, go check it out, [here's the link again](https://genez.io/), I'll wait 😊.

Initially, I didn't know where to fit it in my stack as I already have a lot of experience with AWS and I am pretty comfortable with Lambda. That’s until one random day when I wanted to test something out quickly and didn’t want to fiddle around with all the setup. I remembered about Genezio and wanted to give it a try. It was a pleasant and frictionless experience: from my TypeScript code to the cloud in less than 3 minutes (including creating an account, installing the CLI, and logging in with the CLI). After this experience, I used it 3/4 more times and the frequency is growing, and the experience is still very good. I only encountered one bug and at this point, I was so happy with the product I decided to fix it myself and [contribute back the change](https://github.com/Genez-io/genezio/pull/617).

But, as you might guess, I wouldn't be writing a post just to tell you that. I have a problem with Genezio, and that problem is: from my **TypeScript** code to the cloud in less than 3 minutes. Got it? It’s TypeScript. **The problem is** **TypeScript**.

Let me make it clear, I would pick TypeScript over JavaScript any time (I can't go without types for even 2 seconds), and it's my second most preferred language. However, it's still JavaScript, and I've reached my limit with this godly awful language and all its runtimes.

At the moment Genezio only supports JavaScript/TypeScript, Dart (weird flex, but ok), and Kotlin (coming soon, I think). Despite having experience with three out of the four languages on this list, I must admit that I am not particularly fond of any of them.

Now **Rust**, that’s a real language, for real men! (I understand if you find this statement offensive, you must understand it’s intentional; it’s called **humor**).

I had a bit of free time on my hands and I thought, you know what, I’ll do it myself, I’ll add **Rust support to Genezio**. After all, it’s just Lambda, right? And Lambda already supports Rust, so how hard could it be? Oh boy.

## solution tldr.

It sounds crazy but I somehow managed to pull it off. You can even use it yourself. [Check out the project here](https://github.com/laurci/genezio-rs).

## Step 1. Discovery.

Let’s get to know our entry point a bit better. What does Genezio do to my code when I deploy it to make it seamlessly work on Lambda? Sadly, there are not a lot of resources on this topic, so we’ll need to do a bit of investigation work.

This is what we’re starting with:

```tsx
import { GenezioDeploy } from "@genezio/types";

@GenezioDeploy()
export class Hello {
	async world() {
		return "Hello world!";
	}
}
```

After a bit of reverse engineering, I managed to find that the CLI first bundles my code to an `mjs` file. Interesting, but not enough. Lambda needs a handler function to be exported, but I only found my code (and a bit of utils code packed by the bundler). This means the entry point is probably not my code.

Let’s dig more. I created a method in my class that gets the directory of the current file (this would be the bundle generated from my code) and lists its content. I deployed this code to Genezio and called this method. Just as I thought there is another file next to my bundle, and its name is `index.mjs`. Bingo! I modified my code again to read the contents of this file, and it looks something like this:

```jsx
import {
    Hello as genezioClass
} from "./module.mjs";
var handler = undefined;
if (!genezioClass) {
  // log and handle error...
} else {
    let object;
    try {
        object = new genezioClass();
    } catch (error) {
      // log and handle error...
    }
    handler = handler ?? async function(event, context) {
        // process request (and invoke the correct method on object)
    };
}
export {
    handler
};
```

I’ve removed a lot of code from this, as it’s not important for what we need and it makes it easier to explain. My code was bundled into `module.mjs`. The first thing that the entry point does, is to import my class from the bundle. It then defines a global `handler` and initializes it with `undefined`. It then tries to create a new instance of my class and uses this instance in the handler when new requests come. There is also quite a lot of error handling (as we would expect for the kind of services Genezio offers). At the end, it exports the handler. This is what Lambda will call when it is invoked by external events (like HTTP calls).

## Step 2.  Plan A.

We can compile Rust to WASM. Node can run WASM. If we somehow find a way to intercept the handler creation and supply our own, we could redirect HTTP calls to the Rust WASM binary. Sounds like a plan. Let’s try it!

Our only path to execute code before the handler is assigned is in the constructor of our class. My thought was to use some disgusting JavaScript/Node hidden control flow to stop the handler from being assigned in the entry point code and replace the global handler with our function. It would look something like this:

```tsx
import { GenezioDeploy } from "@genezio/types";

@GenezioDeploy()
export class Hello {
  constructor() {
    process.removeAllListeners("uncaughtException");
    process.on("uncaughtException", async function(err) {
      globalThis.handler = () => {
          return {
            statusCode: 200,
            body: "Hello Genezio!"
          };
      };
    });

    throw new Error();
  }

	async world() {
		return "Hello world!";
	}
}
```

Now, I would expect to see `Hello Genezio!` instead of `Hello world!` when I run the `world` method. This didn’t work, and here’s why:

- the instantiation of our class is wrapped in a try-catch block and we can’t interrupt the normal execution, so even if we could modify the global handler, it would be reassigned afterward
- even if we were able to modify the global handler, if we interrupt the normal execution it wouldn’t be exported anymore (this happens at the bottom of the entry point) so it would just be undefined, which is not what we want

I guess the popular saying “Plan A always goes up in flame” is accurate.

## Step 3.  Plan B.

Upon further investigation, I came across an interesting revelation: Lambda runtimes operate through polling rather than event listening (at least according to my findings from the Rust runtime's source code).

This means that if we can stop code execution before the Node Lambda takes over and instead use another runtime (in this case Rust) to poll events, Lambda won’t even know it’s running Rust instead of JavaScript.

We can compile Rust to a dynamic library, and store it in our code as a base64 encoded string. In the constructor, we can decode it, write it to disk, load it, start executing a function, and make sure this call is blocking.

To achieve this we can build a native C++ module for Node and bundle it with our source (same deal: store as base64, write to disk, and load it) that can load the Rust library, resolve a symbol with a known name, and redirect execution there. Sounds like a plan. Let’s try it!

First, we need the C++ Node module. We’ll call it `lambda_trap`, and it looks something like this:

```cpp
#include <node.h>
#include <stdio.h>
#include <dlfcn.h>

namespace trap {

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;
using v8::Exception;

void Trap(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  // path to dylib
  if (args.Length() < 1) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(isolate, "Wrong number of arguments").ToLocalChecked()));
    return;
  }

  if (!args[0]->IsString()) {
    isolate->ThrowException(Exception::TypeError(
      String::NewFromUtf8(isolate, "Wrong arguments").ToLocalChecked()));
    return;
  }

  v8::String::Utf8Value str(isolate, args[0]);
  const char* path = *str;

  fprintf(stdout, "Loading trap at: %s\n", path);

  // open dylib
  void* handle = dlopen(path, RTLD_LAZY);
  if (!handle) {
    fprintf(stderr, "%s\n", dlerror());
    exit(EXIT_FAILURE);
  }

  // get function pointer
  typedef void (*trap_fn)(void);
  trap_fn trap = (trap_fn)dlsym(handle, "trap");
  if (!trap) {
    fprintf(stderr, "%s\n", dlerror());
    exit(EXIT_FAILURE);
  }

  // call function
  trap();
}

void Initialize(Local<Object> exports) {
  NODE_SET_METHOD(exports, "trap", Trap);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)

}
```

This is a very simple C++ Node module that defines a single exported function `trap` that accepts the path to the dynamic library to load. After the library is loaded it looks for the trap symbol, assumes it's a function pointer, and just calls it.

To build this we’ll use this simple `node-gyp` config:

```json
{
  "targets": [
    {
      "target_name": "lambda_trap",
      "sources": [ "module.cc" ]
    }
  ]
}
```

Now for the Rust library, we’ll just print something to stdout (we should see it in the Genezio logs later), and then stall forever:

```rust
#[no_mangle]
pub extern "C" fn trap() -> ! {
    println!("Rust trap()");

    loop {}
}
```

Don’t forget to specify the `cdylib` crate type in your `Cargo.toml`, as we want to build a C-ABI-compatible dynamic library.

Now let’s write a simple JavaScript snippet to test this:

```jsx
const path = require("path");
const lambda_trap = require("./build/Release/lambda_trap.node");

lambda_trap.trap(path.join(__dirname, "./trap/target/release/libtrap.dylib"));

console.log("next");
setTimeout(() => {
  console.log("next timeout");
}, 1000);
```

And if we run this with Node, it works! 🎉 We see `Rust trap()` logged and we don’t see `next` and `next timeout`.

And here’s where the fun ends. Why? Turns out Genezio uses ARM64 Lambdas. Lambda itself uses Amazon Linux, which provides `musl libc` instead of `glibc`. This means we have to cross-compile to `arm64-musl` which is quite an exotic cross-compilation target. While getting Rust to compile to this target was difficult (but possible), getting node-gyp to compile to this target is something I didn’t manage to get working. I don’t know how to do it, and it frustrates me terribly! If you did this in the past and you were successful, drop me a hint, please.

Also, turns out that Rust `cdylib` support for `musl` is kinda bad anyway, so we would prefer to use standalone executables.

I guess the not-so-popular saying “Plan B always goes up in flame” is also accurate.

## Step 4.  Plan C.

We can compile Rust to `arm64-musl` as a standalone, statically linked executable. We can store it as base64, decode it, write it to disk, and use `execSync` to run it and block execution. Sounds like a plan. Let’s try it!

First the Rust code. I just used the example for Lambda with Axum provided by AWS from [here](https://github.com/awslabs/aws-lambda-rust-runtime/blob/main/examples/http-axum/src/main.rs) and simplified it a bit.

```rust
use lambda_http::{
    run,
    Error,
};
use axum::{
    response::Json,
    Router,
    routing::get,
};
use serde_json::{Value, json};

async fn root() -> Json<Value> {
    Json(json!({ "msg": "Hello rust!" }))
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app = Router::new()
        .route("/", get(root));

    run(app).await
}
```

We then built it for the `aarch64-unknown-linux-musl` target in release mode. We can then copy the base64 encoded output of the build for later use.

Now all we need is the JavaScript code for Genezio. It looks something like this:

```jsx
import { writeFileSync, chmodSync } from 'fs';
import { execSync } from 'child_process';

const TRAP_BIN = Buffer.from('{base64}', 'base64');

@GenezioDeploy()
export class Service {
  constructor() {
    writeFileSync('/tmp/trap', TRAP_BIN);
    chmodSync('/tmp/trap', '755');

    console.log('trap start time', Date.now());
    execSync('/tmp/trap', { stdio: 'inherit' });
  }

  @GenezioMethod()
  async call() { }
}
```

This code decodes the base64 string containing our executable, writes it to disk to the `/tmp` file system (we needed something writeable), makes it executable, and starts it using `execSync`. The rest of the initialization code from Genezio doesn’t run, so the Lambda Node runtime doesn’t get to poll events. Instead, our executable contains the Lambda Rust runtime that will poll the events and execute our Rust handler.

Now if we deploy this to Genezio, and open the lambda URL in the browser (you can get it from the Genezio dashboard) we can see the “Hello rust!” JSON message we responded with. That’s it! We got it! 🎉 🎉 🎉

## The finish line

It sounds crazy but I somehow managed to pull it off. You can even use it yourself. [Check out the project here](https://github.com/laurci/genezio-rs). I added a bit of polish, but it works in the way we explored in this post.

I also measured the start-time penalty we introduced and it’s only about 4ms. I can live with that 🙂

Thanks for walking with me! Have a nice one!
