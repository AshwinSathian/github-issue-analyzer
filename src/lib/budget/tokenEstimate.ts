const TOKEN_DIVISOR = 4;

export const estimateTokens = (text: string): number => {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / TOKEN_DIVISOR);
};
