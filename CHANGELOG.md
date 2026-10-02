# Changelog


## v0.1.0


### 🚀 Enhancements

- Encode, decode and identify binary-to-text encodings ([c74b2b7](https://github.com/agntn/encodings/commit/c74b2b7))
- Re-export the tool limits from the executors ([818da7c](https://github.com/agntn/encodings/commit/818da7c))
- Export the bech32 word conversion ([#15](https://github.com/agntn/encodings/pull/15))
- Build Base58Check over any hash ([#16](https://github.com/agntn/encodings/pull/16))
- Write base32 without padding ([#17](https://github.com/agntn/encodings/pull/17))
- ⚠️  Peel layers, add base85, octal and decimal ([#23](https://github.com/agntn/encodings/pull/23))
- ⚠️  Turn base32hex and base64url into options ([#18](https://github.com/agntn/encodings/pull/18))
- **docs:** Peel layers in the playground ([#25](https://github.com/agntn/encodings/pull/25))
- ⚠️  Make every variant an option of its family ([#27](https://github.com/agntn/encodings/pull/27))
- Read binary in any two symbols ([#29](https://github.com/agntn/encodings/pull/29))
- Add base256 for emoji and symbol tables ([#30](https://github.com/agntn/encodings/pull/30))
- Add EBCDIC and other code pages ([#31](https://github.com/agntn/encodings/pull/31))

### 🩹 Fixes

- Report a partial Z85 group as an encoding error ([2e58e55](https://github.com/agntn/encodings/commit/2e58e55))
- **cli:** Align the option flags of list ([44ece32](https://github.com/agntn/encodings/commit/44ece32))
- **tools:** Ignore options the encoding does not take ([c0ebd31](https://github.com/agntn/encodings/commit/c0ebd31))
- **cli:** Catch dashed text before citty does ([#21](https://github.com/agntn/encodings/pull/21))
- **tools:** Show the text peel steps down from ([#28](https://github.com/agntn/encodings/pull/28))

### 📖 Documentation

- Correct who uses z-base-32 and where Z85 is safe ([c810483](https://github.com/agntn/encodings/commit/c810483))
- Add the README and the agent notes ([acaa85d](https://github.com/agntn/encodings/commit/acaa85d))
- Add encodings.agntn.dev ([f9f3593](https://github.com/agntn/encodings/commit/f9f3593))
- Drop what the site kept from hashes ([af5819d](https://github.com/agntn/encodings/commit/af5819d))
- Point the worker at its EU databases ([6bd3042](https://github.com/agntn/encodings/commit/6bd3042))
- Say why .node-version stays ([63b7d18](https://github.com/agntn/encodings/commit/63b7d18))

### 🏡 Chore

- Extend the agntn renovate preset ([2dbe9ec](https://github.com/agntn/encodings/commit/2dbe9ec))
- Drop .node-version ([10b3b9a](https://github.com/agntn/encodings/commit/10b3b9a))
- Restore .node-version, Workers Builds reads Node 26 from it ([813e71f](https://github.com/agntn/encodings/commit/813e71f))
- Rename lint:fix to fmt ([#22](https://github.com/agntn/encodings/pull/22))

### ✅ Tests

- **mcp:** Match control characters by class ([3f2d2ef](https://github.com/agntn/encodings/commit/3f2d2ef))

#### ⚠️ Breaking Changes

- ⚠️  Peel layers, add base85, octal and decimal ([#23](https://github.com/agntn/encodings/pull/23))
- ⚠️  Turn base32hex and base64url into options ([#18](https://github.com/agntn/encodings/pull/18))
- ⚠️  Make every variant an option of its family ([#27](https://github.com/agntn/encodings/pull/27))

### ❤️ Contributors

- Aeitwoen ([@aeitwoen](https://github.com/aeitwoen))
- Ori ([@oritwoen](https://github.com/oritwoen))
- Oritwoen ([@oritwoen](https://github.com/oritwoen))

