GRADE_PROMPTS = {
    1: (
        "Rewrite the following text for a young child in Grade 1.\n"
        "Use very short, simple sentences and easy words.\n"
        "Keep all facts, numbers, and names exactly the same.\n"
        "Do not add or remove any information.\n"
        "Explain it like teaching a child clearly.\n\n"
        "Text:\n{input}\n\nSimplified version:"
    ),
    2: (
        "Simplify the following text for a Grade 2 student.\n"
        "Use short sentences and simple words, but keep all facts correct.\n"
        "Do not miss any information.\n\n"
        "Text:\n{input}\n\nSimplified version:"
    ),
    3: (
        "Simplify the following text for a Grade 3 student.\n"
        "Keep the scientific meaning and all facts the same.\n"
        "Use clear, plain language that a 9-year-old can understand.\n\n"
        "Text:\n{input}\n\nSimplified version:"
    ),
}
