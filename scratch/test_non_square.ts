import { readFileSync } from "fs";
import { join } from "path";

async function test() {
  const filesDir = "d:/ui/test/server/files";
  const jpgFile = "20db8655-00c5-47aa-9163-684a68ff31e2.jpg";
  const imagePath = join(filesDir, jpgFile);
  const buffer = readFileSync(imagePath);
  const base64Image = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const payload = {
    prompt: "参考这张绵绵冰 做一个在真实环境下的效果",
    model: "gpt-image-2",
    size: "2048x2048",
    images: [base64Image],
  };

  console.log("Sending generate-image request with non-square JPEG...");
  const res = await fetch("http://localhost:3000/generate-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("Response:", data);

  if (data.taskId) {
    console.log(`Polling task ${data.taskId}...`);
    for (let i = 0; i < 120; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusRes = await fetch(`http://localhost:3000/tasks/${data.taskId}`);
      const statusData = await statusRes.json();
      console.log(`Poll ${i + 1}:`, statusData);
      if (statusData.status === "success" || statusData.status === "error") {
        break;
      }
    }
  }
}

test().catch(console.error);
