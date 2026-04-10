export type MontyValue =
  | string
  | number
  | boolean
  | null
  | MontyValue[]
  | { [key: string]: MontyValue };

export type RunCodeInputs = Record<string, MontyValue>;

export type RunCodeResult = {
  ok: boolean;
  error: string | null;
  stdout: string;
  stderr: string;
  result: MontyValue;
  metadata: {
    codeLength: number;
    inputKeys: string[];
    runtime: string;
    linked: boolean;
  };
};

export type ExpoMontyModuleEvents = {};
