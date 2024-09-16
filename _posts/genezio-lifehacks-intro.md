---
title: "Genezio Lifehacks: Introduction"
excerpt: "Genezio is the serverless platform with the coolest concept I've seen so far. In this series of articles, I'll show you some of the tricks I've learned that make it even better."
coverImage: "/assets/blog/genezio/cover.png"
date: "2023-03-17T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/genezio/cover.png"
---

## What is [Genezio](https://genez.io)?

Genezio is a serverless platform that allows you to create and deploy serverless applications in a matter of minutes. It's a great tool for developers who want to build applications without having to worry about the infrastructure.

The key difference between Genezio and other serverless platforms is that it's not just a platform, it also generates some client-side code that you can use to interact with your serverless functions. I like that. I like that a lot. It tries to hide the network layer from you, so you can focus on the business logic.

If you target Typescript as the language for the client SDK, you even get some basic type safety. It's not perfect, but it's a good start (I'll go more in depth in a future article).

## Getting started

I don't use JS. I can't breathe in it. I don't like it. I don't like the syntax, I don't like the tooling, I don't like anything about it. Sprinkle some static types on top of that dumpster fire and suddenly it becomes usable. That is to day, I'm using only Typescript, I don't touch JS.

So, you can start by following [their guide](https://docs.genez.io/genezio-documentation/getting-started/lets-get-you-started) but use the Typescript example instead of the Javascript one. It's the same thing, but with types.

You'll end up with a project that is split in two directories `server` and `client`. The `server` directory contains the serverless functions and the `client` directory contains a basic Node app that uses the generated client SDK to interact with the serverless functions.

### First problem: the project is split in multiple packages but it's not a workspace

This means that you must go in each directory and run `npm install` and other scripts. I don't like that. I also don't like NPM (I prefer Yarn, but that's a different story).

So, I'm going to create a new empty project and use Yarn workspaces to manage the project. You can find that template [here](https://github.com/laurci/genezio-starter-ts). I also added some quality of life features like Prettier and a Yarn plugin for workspaces management. Check the README for more details.

### Second problem: the CLI uses Webpack to bundle the server code

Webpack is slow. I prefer using `esbuild` where I can. I have another template [here](https://github.com/laurci/genezio-starter-tsup) that uses `tsup` to bundle the code. Genezio uses the bundled code as the entry point for the serverless functions, so it won't need to bundle it again. I did however break support for enums (and any other features that rely on the initial AST), but I don't use enums, so I don't care.

## Conclusion

I'll stop here for now. We have a pretty good starting point. It makes Genezio a lot more pleasant to work with. I'll continue in the next article with some more tips and tricks.

