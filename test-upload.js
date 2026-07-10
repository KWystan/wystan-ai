const http = require('http');

// Create a moderate-sized test image (200x200 solid blue, ~1KB PNG)
const pngBuf = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9' +
  'kT1Iw0AcxV9TpUUqDnYQcchQnSyIijhKFYtgobQVWnUwufQLmjQkKS6OgmvBwY/FqoOLs64OroIg' +
  '+AHi5uak6CIl/i8ptIjx4Lgf7+497t4BQr3MNKtrAtB020wl4mImuyoGXxGFiBimJadkZjHzlNhD' +
  'z/V1Dx9f76I8y/vcn6NPyZkM8InEs0w3bOIN4ulN2+C8TxxhRVklPiceM+mCxI9cVzx+41x0WeCZ' +
  'ETOdmicOEYuFNlbbmBUMlXiKOKaoGuX7M64qnLc4q+Uaa96TvzCc01eWuU5rEHEsYgkSRMioooQy' +
  'LMRo10mxkCL9uI9/yPWL5FLIVQITxzwq0CC5fvB/+D1bMz8x4SYFY0Dni23/GgUCu0CjZtvfx7bd' +
  'OAECz8CV1vJX6sDMJ+m1lhY5Anq3gYvrlibvAZc7wMCTLhmSI/lpCvk88H5G35QF+m+BHTe3vuc4' +
  'fQCyNKvkDXBwCIwUKHvd493d7X37t6bZvx8RtnK5LK1pGQAAIAASURBVHic7L13eFzVuf//nmkz' +
  'RcWSLNmyLXe5V+zYEBxIID9KCHAnISFAgBtys4EvkHtDIIFcCAncUEIJJUBoAQKYYghgiqk2BgPG' +
  'vciWZXVp+jTdvz/mzJkzZ2aksY11v8/z6tGj2Wftvfbc9azPWtbaDy1JMpk0JEmSJEmSJP3fIU3X' +
  'AUiSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmS' +
  '/o9QIx0H+V9H46kP4/7iB0i/8QJkPB39pR8j/cZ/kPH0dJR//X0kVr4F9W/9DZL3/Te0tfXQ3/oJ' +
  '0m+8AJmM+R8hvexu6C/9GOn4c8j8836kX38BUm/7Meh/fBfSyz8C/c3/g6SXDX3Dr9B/+hzS/3oR' +
  '+t//G8ZffoO0rhjoHzwM/cVbgfXvQnrVfZB6Z4G0tgj0jz6AzF9/BOP7Y4j/9M/QCh2gPfCjRLIt' +
  'plAo6CzL1lpLURRJpmmWJEmSJEmSJEmSJEmSJEmSJEmSpP/3SB4BQd/4M9J//wOMN3+J9JUPQNJf' +
  'j/aXG2AUjodU6KDV90P/y42Q3vYg9J9/Bvh2MFLRDRlfBxlfB6nQAaD7IeNrIWvfjfSKB6H1xADr' +
  'XKCVOhjF45FadQ/kD56C8dZnkH7+99BfeB0wTq8+B6l4DvRfPAKZWAv91UdBq9kP/d8fQ2btPyH1' +
  'TodR3BdyRxe0UAeMyT2g/eFBpN94BFL/HABjDPTaHwC9+B7o//hrgN9glkR0JzZkZUYrLYAUKBUK' +
  'hUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqF' +
  'QqFQKBQKRSH4PwAEaP/BuMhdjyAlAAAAAElFTkSuQmCC',
  'base64'
);

const boundary = '----Test' + Date.now();
const body = Buffer.concat([
  Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'),
  pngBuf,
  Buffer.from('\r\n--' + boundary + '--\r\n')
]);

// Step 1: Upload
function upload() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 5000, path: '/api/upload', method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

// Step 2: Chat with the image
async function chat(imageData) {
  const chatBody = JSON.stringify({
    model: 'minimaxai/minimax-m3',
    messages: [
      { role: 'user', content: [
        { type: 'text', text: 'What color is this image? Reply in one word.' },
        { type: 'image_url', image_url: { url: imageData } }
      ]}
    ]
  });

  console.log('Chat body size:', (chatBody.length / 1024).toFixed(1), 'KB');

  const res = await fetch('http://localhost:5000/api/chat-full', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: chatBody
  });

  console.log('Chat response status:', res.status);
  if (res.status !== 200) {
    const err = await res.text();
    console.log('Error body:', err.substring(0, 500));
    return '';
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
  let eventCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t || !t.startsWith('data:')) continue;
      const raw = t.slice(5).trim();
      if (raw === '[DONE]') { console.log('SSE: [DONE]'); continue; }
      try {
        const p = JSON.parse(raw);
        eventCount++;
        if (p.error) {
          console.log('SSE ERROR:', JSON.stringify(p.error));
          continue;
        }
        const c = p.content || p.choices?.[0]?.delta?.content || '';
        if (c) full += c;
        else if (eventCount <= 3) console.log('SSE event (no content):', raw.substring(0, 200));
      } catch (e) {
        console.log('SSE unparseable:', raw.substring(0, 200));
      }
    }
  }
  console.log('Total SSE events:', eventCount);
  return full;
}

async function main() {
  console.log('=== Step 1: Upload image ===');
  const uploaded = await upload();
  console.log('Upload type:', uploaded.type, '| size:', uploaded.size, 'bytes');
  console.log('Data URL length:', uploaded.data.length, 'chars');

  if (uploaded.type !== 'image') {
    console.log('❌ Upload did not return type:image');
    return;
  }

  console.log('\n=== Step 2: Send chat with image ===');
  const reply = await chat(uploaded.data);
  console.log('Reply:', reply || '(empty)');

  if (reply) {
    console.log('\n✅ Full flow works! Image → upload → chat → response');
  } else {
    console.log('\n❌ No response from model');
  }
}

main().catch(e => console.log('FAIL:', e.message));
