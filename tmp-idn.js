const query = `query Fetch {
  ch_0: getLivestreams(streamerID: "f001ba66-3c51-4849-9afa-13cf74eb1571") {
    slug
    playback_url
    status
  }
}`;

async function main() {
  const response = await fetch("https://api.idn.app/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.idn.app",
      referer: "https://www.idn.app/",
    },
    body: JSON.stringify({ query }),
  });
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
