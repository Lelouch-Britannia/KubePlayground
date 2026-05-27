module.exports = {
  parserPreset: {
    parserOpts: {
      headerPattern: /^(Feat|Fix|Chore|Refactor|Docs|Test|Update|Ci|Revert): (.+)$/,
      headerCorrespondence: ['type', 'subject'],
    },
  },
  plugins: [
    {
      rules: {
        'body-bullet-pattern': ({ body }) => {
          if (!body) return [true];
          const lines = body.split('\n').filter((l) => l.trim() !== '');
          const pattern =
            /^- (Add|Delete|Remove|Update|Fix|Refactor|Rename|Move|Enable|Disable) .+$/;
          const invalid = lines.filter((l) => !pattern.test(l));
          if (invalid.length === 0) return [true];
          return [
            false,
            `Body lines must follow "- <Verb> <description>" format.\n` +
              `Allowed verbs: Add, Delete, Remove, Update, Fix, Refactor, Rename, Move, Enable, Disable.\n` +
              `Invalid lines:\n${invalid.map((l) => `  "${l}"`).join('\n')}`,
          ];
        },
      },
    },
  ],
  rules: {
    // Header
    'header-max-length': [2, 'always', 100],
    'type-empty': [2, 'never'],
    'type-enum': [2, 'always', ['Feat', 'Fix', 'Chore', 'Refactor', 'Docs', 'Test', 'Update', 'Ci', 'Revert']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],

    // Body
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'body-bullet-pattern': [2, 'always'],
  },
};
