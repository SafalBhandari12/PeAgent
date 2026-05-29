import { GoogleGenAI } from "@google/genai"

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
})

export async function askLLM(question: string, context: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
Answer using the provided data.

Question:
${question}

Data:
${context}
`,
  })
  console.log("LLM response:", response.text)

  return response.text
}
