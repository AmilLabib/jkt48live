import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const handles = [
  "jkt48_aralie",
  "jkt48_delynn",
  "jkt48_alya",
  "jkt48_amanda",
  "jkt48_christy",
  "jkt48_anindya",
  "jkt48_virgi",
  "jkt48_auwia",
  "jkt48_lia",
  "jkt48_lana",
  "jkt48_rilly",
  "jkt48_erine",
  "jkt48_cathy",
  "jkt48_elin",
  "jkt48_chelsea",
  "jkt48_oniel",
  "jkt48_cynthia",
  "jkt48_danella",
  "jkt48_daisy",
  "jkt48_olla",
  "jkt48_feni",
  "jkt48_fiony",
  "jkt48_freya",
  "jkt48_fritzy",
  "jkt48_ella",
  "jkt48_gendis",
  "jkt48_gita",
  "jkt48_gracie",
  "jkt48_greesel",
  "jkt48_giaa",
  "jkt48_eli",
  "jkt48_lily",
  "jkt48_maira",
  "jkt48_indah",
  "jkt48_ekin",
  "jkt48_trisha",
  "jkt48_jemima",
  "jkt48_jessi",
  "jkt48_lyn",
  "jkt48_kathrina",
  "jkt48_lulu",
  "jkt48_marsha",
  "jkt48_michie",
  "jkt48_levi",
  "jkt48_kaela",
  "jkt48_muthe",
  "jkt48_nayla",
  "jkt48_nachia",
  "jkt48_intan",
  "jkt48_oline",
  "jkt48_raisha",
  "jkt48_ribka",
  "jkt48_nala",
  "jkt48_gracia",
  "jkt48_kimmy",
];
const endpoint = "https://api.idn.app/graphql";
const query = `
  query ($username: String!) {
    getPublicProfileByUsername(username: $username) {
      uuid
      username
      name
      avatar
      short_id
    }
  }
`;
const fetchProfile = async (username) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { username } }),
  });
  const json = await res.json();
  if (json.errors?.length || !json.data?.getPublicProfileByUsername) {
    console.error("failed", username, JSON.stringify(json));
    return null;
  }
  return json.data.getPublicProfileByUsername;
};

function toTs(profiles) {
  const header = `// Auto-generated via scripts/update-idn-channels.mjs\nexport interface IdnChannelProfile {\n  username: string;\n  displayName: string;\n  uuid: string;\n  avatarUrl: string;\n  shortId: string;\n}\n\nexport const IDN_CHANNELS: IdnChannelProfile[] = [\n`;
  const body = profiles
    .map((profile) => {
      const displayName = profile.name.replace(/"/g, '\\"');
      return `  {\n    username: "${profile.username}",\n    displayName: "${displayName}",\n    uuid: "${profile.uuid}",\n    avatarUrl: "${profile.avatar}",\n    shortId: "${profile.short_id}",\n  },`;
    })
    .join("\n");
  return `${header}${body}\n];\n`;
}

(async () => {
  const results = [];
  const missed = [];
  for (const username of handles) {
    try {
      const profile = await fetchProfile(username);
      if (profile) {
        results.push(profile);
      } else {
        missed.push(username);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error("error for", username, error);
      missed.push(username);
    }
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await fs.writeFile(
    path.join(root, "idn-profiles.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profiles: results,
        missing: missed,
      },
      null,
      2,
    ),
    "utf8",
  );

  await fs.writeFile(
    path.join(root, "src", "data", "idnChannels.ts"),
    toTs(results),
    "utf8",
  );

  console.log(
    "Saved",
    results.length,
    "profiles to src/data/idnChannels.ts. Missing:",
    missed,
  );
})();
