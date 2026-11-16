export async function connectCEF(base, title) {
  const tabs = await (await fetch(`${base}/json/list`)).json();
  const tab = tabs.find((entry) => entry.title === title);
  if (!tab) throw new Error(`CEF target not found: ${title}`);
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CEF timeout: ${method}`)); }, 10000);
    pending.set(id, (message) => {
      clearTimeout(timeout);
      pending.delete(id);
      if (message.error) reject(Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    send,
    async evaluate(fn, ...args) {
      const result = await send("Runtime.evaluate", {
        expression: `(${fn})(${args.map((arg) => JSON.stringify(arg)).join(",")})`,
        returnByValue: true, awaitPromise: true,
      });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    },
    close: () => socket.close(),
  };
}
