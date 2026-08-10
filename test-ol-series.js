async function test() {
    const query = 'demigods of olympus';
    console.log("Testing Open Library General Query:", query);
    try {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,first_publish_year`;
        const res = await fetch(url);
        const data = await res.json();
        console.log(`Found ${data.docs ? data.docs.length : 0} docs.`);
        if (data.docs && data.docs.length > 0) {
            data.docs.forEach((doc, i) => {
                console.log(`[${i+1}] Title: "${doc.title}" | Author: ${doc.author_name}`);
            });
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
