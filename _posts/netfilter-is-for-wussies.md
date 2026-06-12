---
title: "Netfilter is for wussies."
excerpt: "I needed to allowlist a few IPs for a VM's network. Instead of writing two nftables rules like a normal person, I dragged an entire LLVM backend into my Rust binary and started JIT-compiling firewalls at runtime. This is that story."
coverImage: "/assets/blog/netfilter-is-for-wussies/cover.png"
date: "2026-06-12T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/netfilter-is-for-wussies/cover.png"
---

I've been playing with microVMs lately, and at some point I hit the most boring requirement in all of networking: each VM gets a tap interface, and I need to control which source IPs are allowed to talk to it. An allowlist. That's it. A handful of exact IPs, maybe a subnet or two.

Every sane person reading this already knows the answer. Actually, there are two answers, in increasing order of coolness:

1. Write a few iptables/nftables rules and let netfilter do its thing. Boring. Solved since the 90s. Works great.
2. Write a small eBPF program in C, compile it ahead of time, stick the allowed IPs in a BPF hash map, and look them up per packet. This is the "modern infra person" answer, and it's a perfectly good one.

I did neither. Instead, I dragged an entire LLVM backend into my Rust binary and now I JIT-compile a fresh eBPF program at runtime, with the allowlist baked directly into the instructions, and hot-load it into the kernel as a TC classifier.

Yes, this is the second post where I JIT something ([first one here](https://blog.ciobanu.dev/posts/bf-jit)). No, I will not seek help.

## Wait, why though?

Here's the thought that ruined my week: in the "normal" eBPF approach, the program is generic and the data lives in a map. Every packet pays for a map lookup — hash the key, walk the bucket, call a helper. But my allowlist barely ever changes. Why is it *data* at all?

What if the allowlist **was the program**? An exact IP match becomes a compare against an immediate. A subnet check becomes an AND and a compare. No maps, no helper calls, no lookups. Just straight-line comparisons against constants, which is the one thing CPUs are genuinely thrilled to do.

And if the allowlist changes? Compile a new program and swap it. Spoiler: the compile takes about 3 milliseconds. I've waited longer for `iptables -L`.

Is dragging LLVM into a packet filter justified in any universe? Absolutely not. It's a mass-produced industrial laser aimed at a paper target. But the laser was *right there*.

## The plan

The whole thing is Rust:

- [inkwell](https://github.com/TheDan64/inkwell) (safe-ish LLVM bindings) to build LLVM IR at runtime
- LLVM's BPF backend (`bpfel-unknown-none`) to compile that IR into a BPF ELF object — in memory, no files, no clang
- [aya](https://github.com/aya-rs/aya) to load the ELF and attach it to the tap interface as a TC egress classifier

So the pipeline is: `Vec<Ipv4Addr>` → LLVM IR → BPF ELF bytes → kernel. The kernel then runs its own verifier and JIT on our JIT's output, which means this is technically a JIT being JITted. I find that very funny.

## What a normal person would write

Before we descend into IR-building madness, here's the same filter the way a sane eBPF developer would write it — in C, compiled ahead of time with clang:

```c
SEC("classifier")
int vm_filter(struct __sk_buff *skb)
{
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    /* eth header (14) + min IPv4 header (20) */
    if (data + 34 > data_end)
        return TC_ACT_OK;

    struct ethhdr *eth = data;
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return TC_ACT_OK;

    struct iphdr *ip = data + sizeof(*eth);
    __u32 src = ip->saddr; /* network byte order */

    /* subnet fast path: 10.60.0.0/16 */
    if ((src & bpf_htonl(0xffff0000)) == bpf_htonl(0x0a3c0000))
        return TC_ACT_OK;

    /* exact matches */
    switch (src) {
    case bpf_htonl(0x0a452a02): /* 10.69.42.2 */
        return TC_ACT_OK;
    }

    return TC_ACT_SHOT;
}
```

Twenty-something lines. You'd put the allowed IPs in a BPF map instead of hardcoding them, ship the compiled object with your binary, done. That's the program we're about to build — except instead of writing it once in C, we're going to construct its LLVM IR at runtime, with the allowlist as compile-time constants, every time the allowlist changes. Keep this C version in your head as the map; everything below is just this function, one basic block at a time.

## Building the filter, one basic block at a time

A TC classifier is just a function that takes a `struct __sk_buff *` and returns an action: `TC_ACT_OK` (0) to let the packet through, `TC_ACT_SHOT` (2) to drop it. Great names, by the way. Whoever named `TC_ACT_SHOT` understood the assignment.

```rust
let fn_type = i32_type.fn_type(&[ptr_type.into()], false);
let function = module.add_function("vm_filter", fn_type, None);
function.set_section(Some("classifier"));
```

The `set_section` call matters: aya finds programs by ELF section name, and `classifier` is how it knows this is a TC program.

### The cursed part: getting at the packet

Here's the first thing that will bite anyone trying this: `__sk_buff` exposes the packet boundaries as the `data` and `data_end` fields, which are **u32** fields at fixed offsets (76 and 80) in the context struct. You load them as 32-bit integers and then... cast them to pointers:

```rust
let val = builder.build_load(i32_type, field, "data_u32").unwrap().into_int_value();
let val64 = builder.build_int_z_extend(val, i64_type, "data_u64").unwrap();
builder.build_int_to_ptr(val64, ptr_type, "data").unwrap()
```

If you're thinking "that's not a real pointer, that can't possibly work" — correct, and also it works. The verifier special-cases loads at these exact offsets and rewrites them into real packet pointers at load time. It's a documented kernel-UAPI handshake that looks exactly like a bug. You just have to know the secret handshake and emit it from IR yourself, because there's no clang holding your hand here.

### Keeping the verifier happy

Before touching a single packet byte, the verifier demands proof that you won't read out of bounds. So the first real basic block is:

```rust
// data + 34 <= data_end ?  (14 eth header + 20 min IPv4 header)
let in_bounds = builder
    .build_int_compare(IntPredicate::ULE, lhs, rhs, "in_bounds")
    .unwrap();
builder.build_conditional_branch(in_bounds, check_eth, allow_block).unwrap();
```

Note that a too-short packet branches to **allow**, not deny. Same for non-IPv4 ethertypes. This filter fails open on purpose — if ARP can't get through, nothing else matters and your VM just silently loses its gateway. Ask me how I know.

### The actual filtering

After the ethertype check we load the source IP from offset 26 (14 eth + 12 into the IPv4 header), and then it's two layers of checks.

**Subnets, the fast path.** Each allowed subnet becomes a mask-and-compare:

```rust
let masked = builder.build_and(src_ip, mask_const, ...).unwrap();
let matches = builder.build_int_compare(IntPredicate::EQ, masked, subnet_const, ...).unwrap();
builder.build_conditional_branch(matches, allow_block, next_block).unwrap();
```

One AND, one compare, per subnet. The mask and the subnet are *immediates in the instruction stream*, not values fetched from anywhere.

**Exact IPs.** Instead of emitting a chain of compares myself, I just hand LLVM a `switch`:

```rust
let cases: Vec<_> = allowed_ips.iter()
    .map(|ip| (i32_type.const_int(u32::from_ne_bytes(ip.octets()) as u64, false), allow_block))
    .collect();
builder.build_switch(src_ip, deny_block, &cases).unwrap();
```

This is the lazy genius move. With one IP it's a single compare. With fifty, LLVM's switch lowering gets to decide between compare chains, jump tables, or binary search trees. I get a query planner for free and all I did was call `build_switch`.

One byte-order gotcha for the road: the source IP sits in the packet in network byte order, and we load it raw on a little-endian machine. So all the constants have to be byte-swapped at *compile time* — that's the `from_ne_bytes(octets())` dance. Get this wrong and your filter compiles, loads, verifies, and silently matches nothing. Ask me how I know, part two.

## What comes out

Here's the full IR for an allowlist of one subnet (`10.60.0.0/16`) and one exact IP (`10.69.42.2`):

```llvm
define i32 @vm_filter(ptr %0) section "classifier" {
entry:
  %data_ptr = getelementptr i8, ptr %0, i64 76
  %data_u32 = load i32, ptr %data_ptr, align 4
  %data_u64 = zext i32 %data_u32 to i64
  %data = inttoptr i64 %data_u64 to ptr
  %end_ptr = getelementptr i8, ptr %0, i64 80
  %end_u32 = load i32, ptr %end_ptr, align 4
  %end_u64 = zext i32 %end_u32 to i64
  %data_end = inttoptr i64 %end_u64 to ptr
  br label %bounds_check

bounds_check:
  %data_plus = getelementptr i8, ptr %data, i64 34
  %lhs = ptrtoint ptr %data_plus to i64
  %rhs = ptrtoint ptr %data_end to i64
  %in_bounds = icmp ule i64 %lhs, %rhs
  br i1 %in_bounds, label %check_eth, label %allow

check_eth:
  %ethtype_ptr = getelementptr i8, ptr %data, i64 12
  %ethtype = load i16, ptr %ethtype_ptr, align 2
  %is_ipv4 = icmp eq i16 %ethtype, 8
  br i1 %is_ipv4, label %check_ip, label %allow

check_ip:
  %src_ip_ptr = getelementptr i8, ptr %data, i64 26
  %src_ip = load i32, ptr %src_ip_ptr, align 4
  br label %check_allow_subnets_fast_path

check_allow_subnets_fast_path:
  %masked_0 = and i32 %src_ip, 65535
  %subnet_match_0 = icmp eq i32 %masked_0, 15370
  br i1 %subnet_match_0, label %allow, label %check_exact

allow:
  ret i32 0

deny:
  ret i32 2

check_exact:
  switch i32 %src_ip, label %deny [
    i32 36324618, label %allow
  ]
}
```

Then we point LLVM's BPF backend at it with `OptimizationLevel::Aggressive` and ask for an object file straight into a memory buffer:

```rust
let triple = TargetTriple::create("bpfel-unknown-none");
// ...
let buf = machine.write_to_memory_buffer(module, FileType::Object)?;
```

And this is the entire filter that comes out the other side. Sixteen instructions:

```
0000000000000000 <vm_filter>:
   0: r2 = *(u32 *)(r1 + 0x50)        ; data_end
   1: r1 = *(u32 *)(r1 + 0x4c)        ; data
   2: r3 = r1
   3: r3 += 0x22
   4: if r3 > r2 goto +0x6 <LBB0_3>   ; too short -> allow
   5: r2 = *(u16 *)(r1 + 0xc)
   6: if r2 != 0x8 goto +0x4 <LBB0_3> ; not IPv4 -> allow
   7: r1 = *(u32 *)(r1 + 0x1a)        ; src ip
   8: r2 = r1
   9: r2 &= 0xffff
  10: if r2 != 0x3c0a goto +0x2       ; 10.60.0.0/16 ?

0000000000000058 <LBB0_3>:
  11: r0 = 0x0                        ; TC_ACT_OK
  12: exit

0000000000000068 <LBB0_5>:
  13: if r1 == 0x22a450a goto -0x3    ; 10.69.42.2 ?
  14: r0 = 0x2                        ; TC_ACT_SHOT
  15: exit
```

Look at it. No map lookups, no helper calls, no loops. The subnet check is instructions 9–10: one AND, one compare, both operands immediate. The allowed packet's hot path through this thing is about ten instructions, and then the kernel's own JIT compiles those to native code. There is nothing left to remove.

(That `0x3c0a` is `10.60` viewed through little-endian glasses, in case you were squinting at it. I told you the byte swapping would show up.)

## Shipping it into the kernel

The compile, end to end:

```
compiled target/filter.o (920 bytes) in 3.542498ms
```

3.5 milliseconds, including spinning up the target machine and running aggressive optimization. The ELF is 920 bytes. Loading it is the boring part — bump `RLIMIT_MEMLOCK`, hand the bytes to aya, add a `clsact` qdisc, attach on egress:

```rust
let mut ebpf = aya::Ebpf::load(&elf_bytes)?;
tc::qdisc_add_clsact(&iface)?;
let prog: &mut SchedClassifier = ebpf.program_mut("vm_filter").unwrap().try_into()?;
prog.load()?;
prog.attach(&iface, TcAttachType::Egress)?;
```

The verifier accepted hand-rolled-IR-compiled-by-a-runtime-LLVM on the first... okay, not the first try. But it accepts it now, and that's the version of history we're going with.

To test it I built a tiny virtual neighborhood: a bridge, four network namespaces hanging off it via veth pairs, and the filter attached to the "VM" we're protecting. One neighbor is on the exact-IP list, one is inside the allowed /16, one is on no list at all. Two of them can ping the protected VM. The third one's packets meet `TC_ACT_SHOT` and are never heard from again. The full setup script is in the repo if you want to recreate the crime scene.

## Conclusions

So where does this leave us?

Could you just write nftables rules? Yes. Could you use a static eBPF program with a map? Obviously. Should you JIT-compile packet filters with LLVM at runtime? *No.* The binary now links against a multi-hundred-megabyte compiler backend so it can produce 920-byte filters. That ratio is so bad it loops back around to being beautiful.

Here's the thing though: the LLVM part is the joke, not the JIT part. Look at the disassembly again — it's loads, ALU ops, conditional jumps, and `exit`. Maybe a dozen distinct opcodes. eBPF instructions are fixed-size, 8 bytes each, with a [dead-simple encoding](https://www.kernel.org/doc/html/latest/bpf/standardization/instruction-set.html). You don't need a compiler backend to produce this; you need a few hundred lines of encoder that emit exactly the instructions this filter uses, straight into a byte buffer. Same baked-in constants, same straight-line filter, zero dependencies, and the "compile" goes from 3.5 milliseconds to roughly free.

That's the productionized version of this idea, and I know it holds up because it's literally what we do at [boxd.sh](https://boxd.sh): every box gets its network isolation from JIT-generated eBPF filters, emitted by a small hand-rolled bytecode encoder instead of a rented industrial laser. This post is the same architecture wearing a clown costume.

And since I'm already throwing stones at netfilter, let me take a stab at network namespaces while I'm at it. The conventional way to network-isolate VMs is a namespace per VM, a veth pair, netfilter rules inside. It works, until you try to do it *fast*, at scale: nearly every networking control-path operation in the kernel — creating namespaces, moving interfaces, tearing it all down — serializes on a single global lock, `rtnl_mutex`. On a busy host that's churning through VMs, your boot times stop being about your code and start being about who's queued on that mutex. Making this stack scale is a kernel-lock-contention research project. But a VM is already an isolation boundary; it brought its own kernel to the party. It doesn't need a network namespace to be firewalled. It needs a filter on its tap. One eBPF classifier in the host namespace, no netns lifecycle, no global mutex thunderdome. (Yes, the test rig above uses namespaces. They're lovely for pretending to be four computers on a Tuesday afternoon. As a per-VM data plane under churn, you end up doing lock archaeology to keep your boot times down.)

The idea underneath — **specializing programs against their data instead of looking the data up** — is the same trick real systems pull (the kernel verifier itself rewrites and specializes your bytecode; database engines JIT query plans for exactly this reason). When the data changes rarely and the code runs millions of times per second, turning data into code is just a good trade. I simply chose the most dramatic possible way to demonstrate it.

All the code is at [github.com/laurci/ebpf-jit](https://github.com/laurci/ebpf-jit). Is it useful tho? No, just fun.

These posts take a lot of time to prepare and write. If you like the content I'm making and you wish to support these kinds of useless but fun journeys, I have a [GitHub Sponsors](https://github.com/sponsors/laurci) page!
