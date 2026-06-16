const url = 'https://yunwu.ai/v1/models';
const apiKey = 'sk-ROAEhrKYbHoecxn9RpnB35pnYLhrjjwXVEb6BAOSZwW2kcY1';

fetch(url, {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
})
.then(res => res.json())
.then(data => {
  const veoModels = data.data.filter(m => m.id.toLowerCase().includes('veo'));
  console.log("Veo models:");
  console.log(JSON.stringify(veoModels, null, 2));
})
.catch(err => console.error(err));
