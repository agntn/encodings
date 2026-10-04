# @agntn/encodings

[![npm version](https://npmx.dev/api/registry/badge/version/@agntn/encodings)](https://npmx.dev/package/@agntn/encodings)
[![npm downloads](https://npmx.dev/api/registry/badge/downloads/@agntn/encodings)](https://npmx.dev/package/@agntn/encodings)
[![license](https://npmx.dev/api/registry/badge/license/@agntn/encodings)](https://npmx.dev/package/@agntn/encodings)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/agntn/encodings)

🔤 Binary-to-text encodings, written from the specs. You hand it a weird string, it tells you what's inside. Layer by layer, if it has to. Same answer in the terminal, in TypeScript and in an agent.

> [!CAUTION]
> **Not audited.** This code has never had a security audit. Do not use it in production, with real funds or with sensitive data. It is meant for agents, puzzles and local experiments only. It comes as is, without warranty of any kind, and the authors are not liable for any loss, as the MIT license states. Anything that matters wants an audited library.

## Why?

Paste a base58 string into a chat and ask what it says. The model answers. Confidently. It read the shape, not the bytes. So give it something that reads the bytes.

Docs and a live playground: [encodings.agntn.dev](https://encodings.agntn.dev).

## ✨ Features

- 🔤 **All the usual ones.** Binary, octal, decimal, hex, base32 in four alphabets, base45, base58 in three, base64 in two, base85 in three (Ascii85 and Z85 too), basE91, base256emoji, bech32 and bech32m, uuencode, Quoted-Printable.
- 🧾 **Written from the specs.** RFC 4648, RFC 9285, BIP173, BIP350. No codec library underneath.
- ✅ **Checksums checked.** Base58Check and bech32 refuse a typo instead of decoding it.
- 🪙 **Segwit aware.** A `bc1…` address comes back as its witness version and program.
- 🔍 **`identify`.** Tries every encoding, ranks the ones that work, and tells you why. Three layers deep? `peel` takes them off one by one.
- 🖥️ **Code pages too.** EBCDIC, Latin-1 and Windows-1252. Mojibake goes back to what it was.
- 🤖 **Agent tools.** The same ones over MCP, Pi, OMP and the AI SDK. The MCP ones also answer at [encodings.agntn.dev/mcp](https://encodings.agntn.dev/guide/agents#remote-mcp), nothing to install.
- 📦 **One subpath per family.** Need base58 only? Import base58 only.
- 🌐 **Runs anywhere.** Nothing from `node:*`, no network. The docs site runs it in your tab.
- 🧩 **Bring your own.** An encoding is one object. Register it and `identify` knows it too.

## 📦 Install

```bash
pnpm add @agntn/encodings
```

Node.js 26 or newer.

## 🚀 First call

```bash
npx @agntn/encodings identify 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa -n 3
```

```
0.574  base58 --check              0062e907b15cbf27d5425399ebf6f0fb50ebb88f18  (checksum matches)
0.043  base32 --alphabet=crockford 0a83fb05d62de0e7844da5b4fd04b90d3676876faa
0.024  base58                      0062e907b15cbf27d5425399ebf6f0fb50ebb88f18c29b7d93
```

The genesis address. Version byte `00`, then Satoshi's HASH160. The bare `encodings` below is `pnpm exec encodings` after a local install, or once `pnpm add -g @agntn/encodings`.

```bash
encodings decode bech32 bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 -o hex
```

```
prefix: bc
witnessVersion: 0
751e76e8199196d454941c45d1b3a323f1433bd6
```

The prefix and the version go to stderr. Pipe stdout anywhere, it's pure program bytes. Typo in an address?

```bash
encodings decode base58 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb --check
```

```
base58: checksum does not match
```

Exit code 1. No key, no config, no network.

### Commands

| Command                                   | Does                                                     |
| ----------------------------------------- | -------------------------------------------------------- |
| `encodings encode <encoding> <input>`     | Write text or bytes in an encoding                       |
| `encodings decode <encoding> <text>`      | Read it back into bytes                                  |
| `encodings identify <text>`               | Rank the encodings it decodes in, or `--peel` them off   |
| `encodings convert <input> --from <page>` | Read it as bytes in one code page, write them in another |
| `encodings list [encoding]`               | All of them, one family, or one with its alphabet        |
| `encodings mcp`                           | MCP server over stdio                                    |

`-` reads stdin, `--input-format hex` encodes bytes. Flags per encoding: [CLI guide](https://encodings.agntn.dev/guide/cli).

## 🧠 Library

```ts
import { base58, decode, encode, identify } from "@agntn/encodings";

encode("base64", "gm"); // "Z20="
base58.decode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", { check: true }); // 21 bytes
decode("bech32", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4").details;
// { prefix: "bc", witnessVersion: 0 }
identify("JBSWY3DPEBLW64TMMQ======")[0]?.text; // "Hello World"
```

That's most of it, really. Strings go in as UTF-8, bytes come out as `Uint8Array`. A bad character, a bad checksum, a bad option? Each throws its own error. More in [encoding and decoding](https://encodings.agntn.dev/guide/encoding), [checksums](https://encodings.agntn.dev/guide/checksums) and [identify](https://encodings.agntn.dev/guide/identify).

## 🗂️ Encodings

| Encoding                       | Variants as options                                   |
| ------------------------------ | ----------------------------------------------------- |
| `binary`                       | `symbols`, `bits`, `order`: `msb`, `lsb`              |
| `octal`, `decimal`, `hex`      |                                                       |
| `base32`                       | `alphabet`: `standard`, `hex`, `crockford`, `z`       |
| `base45`                       |                                                       |
| `base58`                       | `alphabet`: `bitcoin`, `flickr`, `ripple`; `check`    |
| `base64`                       | `alphabet`: `standard`, `url`                         |
| `base85`                       | `alphabet`: `rfc1924`, `ascii85`, `z85`               |
| `base91`                       |                                                       |
| `base256`                      | `alphabet`: `emoji`; `multibase`, `symbols`, `sample` |
| `bech32`                       | `m` for Bech32m                                       |
| `uuencode`, `quoted-printable` |                                                       |

Base58Check is `base58` with `check`. z-base-32 is `base32` with `alphabet: "z"`. Got a puzzle in card suits or runes? `base256` takes your own table as `symbols`, or reads its order off a `sample`, and gives you the digits. Decoding takes the same options, so a variant reads back the way it was written. Each family is also a subpath, like `@agntn/encodings/base58`. Alphabets, overhead and options per encoding are on [the encodings page](https://encodings.agntn.dev/encodings).

EBCDIC isn't an encoding, it's a different alphabet for the same bytes. So `charsets` sits outside the registry, on `@agntn/encodings/charsets`. `charsets.toText(bytes, { codepage: "ibm037" })` and back with `fromText`. [Code pages](https://encodings.agntn.dev/guide/code-pages).

## 🤖 Agents

```bash
pi install npm:@agntn/encodings
omp install @agntn/encodings
```

```json
{
  "mcpServers": {
    "encodings": { "command": "npx", "args": ["-y", "@agntn/encodings", "mcp"] }
  }
}
```

Nothing to install at all? The docs site serves the same tools over HTTP, plus `list-pages` and `get-page` for reading the guide:

```bash
claude mcp add --transport http encodings https://encodings.agntn.dev/mcp
```

Your arguments pass through a Cloudflare worker there. Great for an address, a bad idea for a private key.

The tools are `encodings_encode`, `encodings_decode`, `encodings_identify`, `encodings_info` and `encodings_charset_convert`. Same ones in `@agntn/encodings/ai`. Typo in an argument name? You hear about it. Decoded bytes come back as text only when they're clean text, hex otherwise. [Agents guide](https://encodings.agntn.dev/guide/agents).

## 🚫 What this does not do

It doesn't know networks. A version byte stays a byte, and what `0x80` means is [@agntn/keys](https://github.com/agntn/keys)'s job. Caesar, Vigenère and friends? That's [@agntn/ciphers](https://github.com/agntn/ciphers).

## 🧩 Adding an encoding

Implement `Encoding`, call `register`. [Custom encodings](https://encodings.agntn.dev/guide/custom) has an octal one to copy.

## 🛠️ Development

```bash
pnpm install
pnpm --dir docs install   # the /mcp test borrows Zod, the toolkit and the SDK from the docs site
pnpm build       # dist/, the CLI and the subpaths
pnpm test        # vectors from the RFCs and BIPs, plus frozen outputs of other implementations
pnpm lint        # vp lint and vp fmt --check
pnpm typecheck   # src, the extensions and the tests
```

## 💛 Thanks

Built with help from [Claude for Open Source](https://claude.com/contact-sales/claude-for-oss) and [Codex for Open Source](https://developers.openai.com/community/codex-for-oss). Thank you both for backing small tools like this one.

## 📄 License

[MIT](./LICENSE)
