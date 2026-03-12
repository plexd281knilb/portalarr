export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
      console.log("App Started. No background jobs scheduled.");
  }
}