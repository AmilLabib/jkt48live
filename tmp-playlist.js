const url =
  "https://4b964ca68cf1.us-east-1.playback.live-video.net/api/video/v1/us-east-1.050891932989.channel.4hPWCxNDO8aY.m3u8";

async function main() {
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  console.log(text.slice(0, 500));
  const mediaLine = lines.find((line) => line && !line.startsWith("#"));
  if (mediaLine) {
    const mediaUrl = new URL(mediaLine, url);
    const seg = await fetch(mediaUrl);
    console.log("segment status", seg.status, seg.statusText);
    console.log("segment content-length", seg.headers.get("content-length"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
