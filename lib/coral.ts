import { exec } from "child_process";

export function runCoralQuery(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      `coral query "${query}"`,
      (error, stdout, stderr) => {
        if (error) {
          reject(stderr);
          return;
        }

        resolve(stdout);
      }
    );
  });
}