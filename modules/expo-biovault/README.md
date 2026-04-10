# expo-biovault

Expo native module package for parsing genome data files and creating a BioVault SQLite database from a React Native / Expo app.

Example:

```ts
import { processGenomeFile } from '@/modules/expo-biovault';

const databasePath = await processGenomeFile(
  '/path/to/genome.txt',
  'My Genome',
  '/path/to/output'
);

console.log(databasePath);
```
