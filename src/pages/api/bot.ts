import { env } from "~/env.mjs"

export const config = {
	runtime: "edge",
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const getEmbedding = async (text: string) => {
	return (
		(await (
			await fetch("https://api.openai.com/v1/embeddings", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${env.OPENAI_SECRET_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					input: text,
					model: "text-embedding-ada-002",
				}),
			})
		).json()) as { data: [{ embedding: number[] }] }
	).data[0].embedding
}

const searchPoints = async ({
	embedding,
	limit,
	filter,
}: {
	embedding: number[]
	limit: number
	filter?: Record<string, string | number>
}) => {
	return (
		(await (
			await fetch(`${env.QDRANT_URL}/collections/sociology-help/points/search`, {
				method: "POST",
				body: JSON.stringify({
					vector: embedding,
					limit,
					filter:
						filter !== undefined
							? {
									must: Object.keys(filter).map((key) => ({
										key,
										match: { value: filter[key] },
									})),
							  }
							: undefined,
					with_payload: true,
				}),
				headers: {
					"Content-Type": "application/json",
					"api-key": env.QDRANT_API_KEY,
				},
			})
		).json()) as {
			result: { id: number; score: number; payload: Record<string, string | number> }[]
		}
	).result
}

const handler = async function (request: Request) {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405 })
	}

	const { query } = (await request.json()) as { query: string }

	if (!query) {
		return new Response("Bad request", { status: 400 })
	}

	const predictedAnswer = (
		(await (
			await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${env.OPENAI_SECRET_KEY}`,
				},
				body: JSON.stringify({
					messages: [
						{ role: "system", content: "You are helpful and accurate." },
						{
							role: "user",
							content: `Respond with something that sounds like it could be found within the statistics / sociology textbook "Social Statistics for a Diverse Society" that would answer the following question:

${query}`,
						},
					],
					model: "gpt-3.5-turbo-0613",
					temperature: 0,
				}),
			})
		).json()) as { choices: [{ message: { content: string } }] }
	).choices[0].message.content

	const embedding = await getEmbedding(predictedAnswer)

	const results = await searchPoints({ embedding, limit: 5 })

	const textbookPagesUnfiltered = results.map((result) => ({
		pageNumber: result.id - 0,
		wordCount: (result.payload.text as string)
			.split(/\s/)
			.filter((segment) => segment.trim() !== "").length,
		text: result.payload.text as string,
	}))

	const textbookPages: typeof textbookPagesUnfiltered = []

	const wordLimit = 2400

	let words = 0

	for (const page of textbookPagesUnfiltered) {
		if (words + page.wordCount > wordLimit) break

		words += page.wordCount

		textbookPages.push(page)
	}

	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.OPENAI_SECRET_KEY}`,
		},
		body: JSON.stringify({
			messages: [
				{ role: "system", content: "You are helpful and accurate." },
				{
					role: "user",
					content: `Some relevant information from the statistics / sociology textbook "Social Statistics for a Diverse Society":

${textbookPages
	.map((page) => `Page number: ${page.pageNumber}\nContent: ${page.text}`)
	.join("\n\n")}

Use this information to answer a question in depth that a user has just asked you:

${query}

Cite specific pages from the textbook. Be very specific in order to help the user achieve a comprehensive understanding of statistics / sociology.`,
				},
			],
			model: "gpt-3.5-turbo-16k-0613",
			temperature: 0,
			stream: true,
		}),
	})

	return new Response(
		new ReadableStream({
			start: async (controller) => {
				if (response.body) {
					const reader = response.body.getReader()

					let previousIncompleteChunk: Uint8Array | undefined = undefined

					while (true) {
						const result = await reader.read()

						if (!result.done) {
							let chunk = result.value

							if (previousIncompleteChunk !== undefined) {
								const newChunk = new Uint8Array(
									previousIncompleteChunk.length + chunk.length
								)

								newChunk.set(previousIncompleteChunk)

								newChunk.set(chunk, previousIncompleteChunk.length)

								chunk = newChunk

								previousIncompleteChunk = undefined
							}

							const parts = textDecoder
								.decode(chunk)
								.split("\n")
								.filter((line) => line !== "")
								.map((line) => line.replace(/^data: /, ""))

							for (const part of parts) {
								if (part !== "[DONE]") {
									try {
										// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
										const contentDelta = JSON.parse(part).choices[0].delta
											.content as string | undefined

										controller.enqueue(textEncoder.encode(contentDelta))
									} catch (error) {
										previousIncompleteChunk = chunk
									}
								} else {
									controller.close()

									return
								}
							}
						} else {
							console.error(
								"This also shouldn't happen, because controller should be close()ed before getting to end of stream"
							)
						}
					}
				} else {
					console.error("This shouldn't happen")
				}
			},
		}),
		{
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		}
	)
}

export default handler
