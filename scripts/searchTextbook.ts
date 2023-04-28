const { QDRANT_URL, QDRANT_API_KEY, OPENAI_SECRET_KEY } = process.env

if (typeof QDRANT_URL !== "string") {
	console.error("Must set QDRANT_URL environment variable")

	process.exit(1)
}

if (typeof QDRANT_API_KEY !== "string") {
	console.error("Must set QDRANT_API_KEY environment variable")

	process.exit(1)
}

if (typeof OPENAI_SECRET_KEY !== "string") {
	console.error("Must set OPENAI_SECRET_KEY environment variable")

	process.exit(1)
}

const getEmbedding = async (text: string) => {
	return (
		(await (
			await fetch("https://api.openai.com/v1/embeddings", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${OPENAI_SECRET_KEY}`,
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
			await fetch(`${QDRANT_URL}/collections/stats-helper/points/search`, {
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
					"api-key": QDRANT_API_KEY,
				},
			})
		).json()) as {
			result: { id: number; score: number; payload: Record<string, string | number> }[]
		}
	).result
}

const main = async () => {
	const query =
		"Why do I use the word confident instead of probability when interpreting a condidence interval?"

	const predictedAnswer = (
		(await (
			await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${OPENAI_SECRET_KEY}`,
				},
				body: JSON.stringify({
					messages: [
						{ role: "system", content: "You are helpful and accurate." },
						{
							role: "user",
							content: `Respond with something that sounds like it could be found within the AP Statistics text book "The Practice of Statistics" that would answer the following question:

${query}`,
						},
					],
					model: "gpt-3.5-turbo",
					temperature: 0,
				}),
			})
		).json()) as { choices: [{ message: { content: string } }] }
	).choices[0].message.content

	console.info("Predicted answer: ", predictedAnswer)

	const embedding = await getEmbedding(predictedAnswer)

	const results = await searchPoints({ embedding, limit: 5 })

	const textbookPagesUnfiltered = results.map((result) => ({
		pageNumber: result.id - 28,
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

	const answer = (
		(await (
			await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${OPENAI_SECRET_KEY}`,
				},
				body: JSON.stringify({
					messages: [
						{ role: "system", content: "You are helpful and accurate." },
						{
							role: "user",
							content: `Some relevant information from the AP Statistics textbook "The Practice of Statistics":

${textbookPages
	.map((page) => `Page number: ${page.pageNumber}\nContent: ${page.text}`)
	.join("\n\n")}

Use this information to answer a question in depth that a user has just asked you:

${query}

Cite specific pages from the textbook. Be very specific in order to help the user achieve a comprehensive understanding of statistics.`,
						},
					],
					model: "gpt-3.5-turbo",
					temperature: 0,
				}),
			})
		).json()) as { choices: [{ message: { content: string } }] }
	).choices[0].message.content

	console.log("Answer: ", answer)
}

void main()
