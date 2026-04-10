# expo-monty

Expo native module package for embedding the Rust-based Monty runtime in a React Native / Expo app.

Example:

```ts
import { runCode } from '@/modules/expo-monty';

const result = await runCode('print(\"hello world\")');
console.log(result.stdout);
```
