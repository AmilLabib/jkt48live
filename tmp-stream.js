const url =
  "https://4b964ca68cf1.us-east-1.playback.live-video.net/api/video/v1/us-east-1.050891932989.channel.4hPWCxNDO8aY.m3u8";

async function tryFetch(referer) {
  try {
    const response = await fetch(url, {
      headers: {
        referer,
      },
    });
    console.log(referer, response.status, response.statusText);
    const text = await response.text();
    console.log("length", text.length);
  } catch (error) {
    console.error(referer, "error", error);
  }
}

(async () => {
  await tryFetch("https://www.showroom-live.com/");
  await tryFetch("https://www.idn.app/");
})();
