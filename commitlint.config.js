module.exports = {
  parserPreset: {
    parserOpts: {
      // Regex to match "Type: Summary"
      headerPattern: /^(Feat|Fix|Chore|Refactor|Docs|Test|Update): (.+)$/,
      headerCorrespondence: ['type', 'subject'],
    },
  },
  rules: {
    // 1. Disable default strict rules
    'body-leading-blank': [0],
    'footer-leading-blank': [0],
    
    // 2. Enforce your specific types
    'type-enum': [
      2, 
      'always', 
      ['Feat', 'Fix', 'Chore', 'Refactor', 'Docs', 'Test', 'Update']
    ],
    
    // 3. Ensure type is not empty
    'type-empty': [2, 'never'],
    
    // 4. Ensure summary (subject) is not empty
    'subject-empty': [2, 'never'],
  },
};