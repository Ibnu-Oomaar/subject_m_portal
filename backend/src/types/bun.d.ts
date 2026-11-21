declare const Bun: {
  argv: string[];
  password: {
    hash(password: string, algorithm: 'argon2id'): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
};
