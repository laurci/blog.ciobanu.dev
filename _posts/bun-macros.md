---
title: "Why doesn't anyone talk about the coolest Bun feature?"
excerpt: "Everyone is excited about Bun, but nobody is talking about its macros system! In this post I will show you a bit about this system, how it works and how to use it."
coverImage: "/assets/blog/bun-macros/cover.png"
date: "2022-08-11T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/bun-macros/cover.png"
---

## What is Bun?

[**Bun**](https://bun.sh/) is a new JavaScript runtime for the server-side. It's an alternative to Node, similar to Deno (checkout [Ryan Dahl's talk on Deno](https://www.youtube.com/watch?v=M3BM9TB-8yA)).

I'll quickly go over some of the key elements of Bun:

-   Speed. Bun is written in Zig with a great focus on performance.
-   Uses JavaScriptCore instead of V8. I have mixed feelings about this, but maybe we'll go deeper in another post.
-   Is a complete toolbox instead of just a toolbox. It includes a bundler, package manager, test runner, transpiler, a fridge, a couch, 5 chairs and a dinner table out of the box!
-   Unlike Deno, Bun doesn't throw away all the community packages. Instead, Bun aims for almost full Node-API compatibility (including the native modules). Not there yet, but part of their goal.

## The secret feature.

If you know me, you would know I wouldn't write a blog post about Bun just to tell you the same things that everyone else tells you.

The one feature I am actually really excited about in Bun is the **Macro system**. I am not actually excited about the feature itself but about the concept. It brings meta-programming closer to the general public, and I love it. It encourages you to write your own meta programs instead of just using some random Babel plugin someone else wrote.

## But what is a macro?

Meta-programming is a technique in which you treat your programs as data instead of code. Think about it like a program that can read and modify your program (or even itself).

A macro in Bun is a function that gets run at "compile" time. Bun calls this function for every instance where it is called. The function receives a reference to the call expression from which it originated. Your macro must return a valid AST (which you represent with JSX). Bun then replaces the call expression with the AST you return.

Let's check it out! You can find all the code in [this repository](https://github.com/laurci/bun-macros-demo).

You can define a macro like so:

```typescript
// macros/hello.tsx
export function hello(callExpr: BunAST.CallExpression) {
    return <string value="hello"></string>;
}
```

You can then use it:

```typescript
// index.ts
import {hello} from "macro:./macros/hello";

function main() {
    const text = hello();
    console.log(text);
}

main();
```

Notice that when you import a macro you must specify `macro:` in front of the path. This tells Bun that the file contains a macro.

If you run this code with `bun run index.ts`, you will see `hello` printed to the console.

Ok, cool, but what's the big deal about this? Let me explain. If we just print out the main function as text, you will se why.

```typescript
console.log(main.toString());
```

You will see the following output:

```javascript
function main() {
    const text = "hello";
    console.log(text);
}
```

As you can see, your call to `hello()` was replaced with the string literal `"hello"`. Amazing!

Let's get to a more interesting example. Let's say you have a CSV file `hello.csv` with some numbers and you have to load that file in your program to do some calculations. This file doesn't change often, so it doesn't make sense to waste time with disk I/O to read and parse it every time.

We can create a macro `readCsv` that reads the file from disk and embeds it as a static array of numbers. We can write it like so:

```typescript
// macros/readCsv.tsx
export function readCsv(callExpr: BunAST.CallExpression) {
    const contents: string = Bun.readFile(Bun.cwd + "hello.csv");
    const numbers = parseCsvToArray(contents);

    return (
        <array>
            {numbers.map((x) => (
                <number value={x} />
            ))}
        </array>
    );
}

function parseCsvToArray(text: string): Array<number> {
    const data = text
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x.trim().length > 0)
        .map((x) => Number(x));
    return data;
}
```

Then we can use it like so:

```typescript
// index.ts
import {hello} from "macro:./macros/hello";
import {readCsv} from "macro:./macros/readCsv";

function main() {
    const text = hello();
    console.log(text);

    const contents = readCsv();
    console.log(contents);
}

main();

console.log(main.toString());
```

The output of this program will look like this:

```shell
hello
[ 34, 35, 400, 20 ]
```

The contents of the main function is the following:

```javascript
function main() {
    const text = "hello";
    console.log(text);
    const contents = [34, 35, 400, 20];
    console.log(contents);
}
```

How cool is this?!! Now if you want to accept the file name as a parameter, we can do this by using the call expression reference I talked about earlier. You have access to the arguments list like this:

```typescript
const [filename] = callExpr.arguments;
```

You can then use `filename` in the macro.

## Conclusions

Bun is cool 😊 But what I am actually excited about is the fact that it brings meta-programming in JavaScript (and TypeScript) closer to the general public. The system itself can use some improvements (the types for `BunAST` are missing, and it's very difficult to navigate the AST without them) and it can be further extended (like `proc-macros` in Rust) but I think it's a great start!
