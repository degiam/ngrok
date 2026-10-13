export default async () => {
  const target = process.env.TARGET_URL

  if (!target) {
    return new Response(JSON.stringify({ online: false, error: 'TARGET_URL belum diset' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const res = await fetch(target, {
      headers: {
        'ngrok-skip-browser-warning': 'true'
      }
    })

    return new Response(JSON.stringify({ online: res.status === 200 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch {
    return new Response(JSON.stringify({ online: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}