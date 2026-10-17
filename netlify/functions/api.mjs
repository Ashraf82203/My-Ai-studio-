
export default async (req) => {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    });

  try {
    const key = process.env.MAGIC_HOUR_API_KEY;

    if (!key) {
      return json({
        error: "Netlify میں MAGIC_HOUR_API_KEY محفوظ نہیں ہے۔"
      }, 500);
    }

    const url = new URL(req.url);
    const route = url.searchParams.get("route") || "";

    async function magic(path, method = "GET", body) {
      const options = {
        method,
        headers: {
          Authorization: `Bearer ${key}`
        }
      };

      if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }

      const response = await fetch(
        "https://api.magichour.ai" + path,
        options
      );

      const text = await response.text();
      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text || "نامعلوم API جواب" };
      }

      if (!response.ok) {
        const message =
          data.message ||
          data.error ||
          `Magic Hour API error: ${response.status}`;

        throw new Error(
          typeof message === "string"
            ? message
            : JSON.stringify(message)
        );
      }

      return data;
    }

    if (req.method === "GET" && route === "/") {
      return json({
        status: "ready",
        message: "My AI Studio API is ready"
      });
    }

    if (req.method === "POST" && route === "/upload-image") {
      const form = await req.formData();
      const file = form.get("image");

      if (!file || typeof file.arrayBuffer !== "function") {
        return json({ error: "براہ کرم تصویر منتخب کریں۔" }, 400);
      }

      if (file.size > 4 * 1024 * 1024) {
        return json({
          error: "4 MB سے چھوٹی تصویر استعمال کریں۔"
        }, 400);
      }

      const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "avif"
      };

      const ext = extensions[file.type];

      if (!ext) {
        return json({
          error: "JPG، PNG، WebP یا AVIF تصویر استعمال کریں۔"
        }, 400);
      }

      const upload = await magic(
        "/v1/files/upload-urls",
        "POST",
        { items: [{ type: "image", extension: ext }] }
      );

      const item = upload.items?.[0];

      if (!item?.upload_url || !item?.file_path) {
        return json({
          error: "تصویر اپلوڈ کا لنک نہیں ملا۔"
        }, 502);
      }

      const put = await fetch(item.upload_url, {
        method: "PUT",
        body: await file.arrayBuffer()
      });

      if (!put.ok) {
        return json({
          error: "تصویر اپلوڈ نہیں ہو سکی۔"
        }, 502);
      }

      return json({ file_path: item.file_path });
    }

    if (req.method === "POST" && route === "/create") {
      const p = await req.json();

      if (!p.prompt?.trim()) {
        return json({ error: "ویڈیو کا پرومپٹ لکھیں۔" }, 400);
      }

      const prompt = [
        p.prompt,
        p.voiceover ? "Voiceover/dialogue: " + p.voiceover : "",
        p.language ? "Language: " + p.language : ""
      ].filter(Boolean).join("\n");

      const result = await magic("/v1/text-to-video", "POST", {
        name: "My AI Studio Video",
        end_seconds: [5, 10].includes(Number(p.seconds))
          ? Number(p.seconds) : 5,
        aspect_ratio: p.aspect_ratio || "16:9",
        model: "ltx-2.5",
        resolution: "480p",
        audio: true,
        style: { prompt }
      });

      return json(result);
    }

    if (req.method === "POST" && route === "/image-to-video") {
      const p = await req.json();

      if (!p.file_path) {
        return json({
          error: "تصویر کا فائل راستہ موجود نہیں۔"
        }, 400);
      }

      const prompt = [
        p.prompt || "",
        p.voiceover ? "Voiceover/dialogue: " + p.voiceover : "",
        p.language ? "Language: " + p.language : ""
      ].filter(Boolean).join("\n");

      const result = await magic("/v1/image-to-video", "POST", {
        name: "My AI Studio Image Video",
        end_seconds: [5, 10].includes(Number(p.seconds))
          ? Number(p.seconds) : 5,
        aspect_ratio: p.aspect_ratio || "9:16",
        model: "ltx-2.5",
        resolution: "480p",
        audio: true,
        style: { prompt },
        assets: { image_file_path: p.file_path }
      });

      return json(result);
    }

    if (req.method === "POST" && route === "/text-to-image") {
      const p = await req.json();

      if (!p.prompt?.trim()) {
        return json({ error: "تصویر کا پرومپٹ لکھیں۔" }, 400);
      }

      const result = await magic("/v1/ai-image-generator", "POST", {
        name: "My AI Studio Image",
        image_count: 1,
        model: "z-image-turbo",
        aspect_ratio: p.aspect_ratio || "1:1",
        resolution: "640px",
        style: {
          prompt: p.prompt,
          tool: "general"
        }
      });

      return json(result);
    }

    const video = route.match(/^\/status\/([^/]+)$/);
    const image = route.match(/^\/image-status\/([^/]+)$/);

    if (req.method === "GET" && video) {
      const result = await magic(
        "/v1/video-projects/" + encodeURIComponent(video[1])
      );

      if (result.downloads?.[0]?.url) {
        result.video_url = result.downloads[0].url;
      }

      return json(result);
    }

    if (req.method === "GET" && image) {
      const result = await magic(
        "/v1/image-projects/" + encodeURIComponent(image[1])
      );

      if (result.downloads?.[0]?.url) {
        result.image_url = result.downloads[0].url;
      }

      return json(result);
    }

    return json({
      error: "API route نہیں ملا۔",
      route,
      method: req.method
    }, 404);

  } catch (error) {
    return json({
      error: error.message || "سرور میں مسئلہ پیش آیا۔"
    }, 500);
  }
};
