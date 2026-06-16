async function test() {
  const baseUrl = "https://api.ephone.ai/v1";
  const apiKey = "sk-ceeKOAZwZ1ZT1pZ3dQW0vWkvO8vrzHXKGeBCtoytwHOCR5Ir";
  const model = "doubao-seedance-2-0-fast-260128";

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", "一只可爱的橙色猫咪，皮克斯3D风格");
  form.append("seconds", "8");
  form.append("size", "16x9");
  form.append("watermark", "false");

  console.log("Sending direct video generation request to ePhone/v1...");
  const res = await fetch(`${baseUrl}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response Text:", text);
}

test().catch(console.error);
