// hibitype-runtime:runtime
var react;
function configureReact(value) {
  react = value;
}
var useEffect = (...args) => react.useEffect(...args);
var useMemo = (...args) => react.useMemo(...args);
var useRef = (...args) => react.useRef(...args);
var useState = (...args) => react.useState(...args);
function jsx(type, props, key) {
  return react.createElement(type, key === void 0 ? props : { ...props, key });
}
var jsxs = jsx;

// src/addons/hibitype/index.tsx
function KeyboardIcon({ size = 19 }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx("rect", { x: "2.5", y: "5", width: "19", height: "14", rx: "2" }),
        /* @__PURE__ */ jsx("path", { d: "M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15h8" })
      ]
    }
  );
}
function ResetIcon() {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx("path", { d: "M3 12a9 9 0 1 0 2.64-6.36L3 8" }),
        /* @__PURE__ */ jsx("path", { d: "M3 3v5h5M12 7v5l3 2" })
      ]
    }
  );
}
var TIME_OPTIONS = [15, 30, 60];
var WORD_OPTIONS = [10, 25, 50];
var PROMPT_WORDS = 180;
var WORD_BANK = "about above after again against almost along already also among another answer around because become before begin being below between both change children city close common company complete continue country course create day different during each early earth enough every example eyes fact few find first follow form found friend general get give go good government great group grow hand hard have head help here high home house however idea important increase interest into issue keep kind know large last late later learn leave left level life light like line list little live long look made make many may mean measure might most move much must name near need never next night number often once open order other over own part people place point problem public right same say school seem set several she should show small so some something sound spell stand start state still story study such system take tell than that their there these thing think through time together too turn under understand until use very want way well went were what where which while who why will with work world would write year".split(
  " "
);
function makePrompt(wordCount) {
  return Array.from(
    { length: wordCount },
    () => WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
  ).join(" ");
}
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1e3);
  const minutes = Math.floor(seconds / 60);
  return String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}
function TypingPractice({ visible }) {
  const [mode, setMode] = useState("time");
  const [option, setOption] = useState(30);
  const [prompt, setPrompt] = useState(() => makePrompt(PROMPT_WORDS));
  const [typed, setTyped] = useState("");
  const [started, setStarted] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const inputRef = useRef(null);
  const currentCharacterRef = useRef(null);
  const complete = started && (mode === "time" ? elapsedMs >= option * 1e3 : typed.length >= prompt.length);
  useEffect(() => {
    if (!visible || !started || complete) return;
    const interval = window.setInterval(() => {
      setElapsedMs(
        (current) => Math.min(mode === "time" ? option * 1e3 : Infinity, current + 100)
      );
    }, 100);
    return () => window.clearInterval(interval);
  }, [complete, mode, option, started, visible]);
  useEffect(() => {
    if (!visible || typed.length === 0) return;
    currentCharacterRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  }, [typed.length, visible]);
  const correctCharacters = useMemo(() => {
    let correct = 0;
    for (let index = 0; index < typed.length; index += 1) {
      if (typed[index] === prompt[index]) correct += 1;
    }
    return correct;
  }, [prompt, typed]);
  const accuracy = typed.length ? Math.round(correctCharacters / typed.length * 100) : 100;
  const wpm = started ? Math.round(correctCharacters * 12e3 / Math.max(elapsedMs, 1e3)) : 0;
  const clock = mode === "time" ? formatTime(Math.max(0, option * 1e3 - elapsedMs)) : formatTime(elapsedMs);
  function reset(nextMode = mode, nextOption = option) {
    setMode(nextMode);
    setOption(nextOption);
    setPrompt(makePrompt(nextMode === "words" ? nextOption : PROMPT_WORDS));
    setTyped("");
    setStarted(false);
    setElapsedMs(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }
  function handleChange(event) {
    if (complete) return;
    let next = event.currentTarget.value.replace(/\r\n?/g, " ").replace(/\n/g, " ");
    if (mode === "words") next = next.slice(0, prompt.length);
    if (next.length > 0 && !started) setStarted(true);
    setTyped(next);
    if (mode === "time" && next.length >= prompt.length - 80) {
      setPrompt((current) => `${current} ${makePrompt(80)}`);
    }
  }
  const promptCharacters = useMemo(() => {
    let id = 0;
    return Array.from(prompt, (character) => ({
      character,
      id: id++
    }));
  }, [prompt]);
  const promptText = promptCharacters.map(({ character, id }, index) => {
    const typedCharacter = typed[index];
    const status = typedCharacter === void 0 ? "" : typedCharacter === character ? "typing-practice__character--correct" : "typing-practice__character--incorrect";
    const current = index === typed.length && !complete ? "typing-practice__character--current" : "";
    return /* @__PURE__ */ jsx(
      "span",
      {
        ref: index === typed.length ? currentCharacterRef : void 0,
        className: ["typing-practice__character", status, current].filter(Boolean).join(" "),
        children: character
      },
      id
    );
  });
  return /* @__PURE__ */ jsx("main", { className: "hibi-typing-practice", "aria-label": "hibitype typing test", children: /* @__PURE__ */ jsxs(
    "div",
    {
      className: [
        "typing-practice__layout",
        started && "typing-practice__layout--started"
      ].filter(Boolean).join(" "),
      children: [
        /* @__PURE__ */ jsxs("header", { className: "typing-practice__header", children: [
          /* @__PURE__ */ jsxs("div", { className: "typing-practice__brand", children: [
            /* @__PURE__ */ jsx(KeyboardIcon, {}),
            /* @__PURE__ */ jsx("span", { children: "hibi" }),
            /* @__PURE__ */ jsx("span", { className: "typing-practice__divider", children: "/" }),
            /* @__PURE__ */ jsx("h1", { children: "hibitype" })
          ] }),
          /* @__PURE__ */ jsxs(
            "button",
            {
              className: "typing-practice__reset",
              type: "button",
              onClick: () => reset(),
              children: [
                /* @__PURE__ */ jsx(ResetIcon, {}),
                /* @__PURE__ */ jsx("span", { children: "new test" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "typing-practice__controls", children: [
          /* @__PURE__ */ jsxs("fieldset", { className: "typing-practice__segmented", children: [
            /* @__PURE__ */ jsx("legend", { className: "typing-practice__sr-only", children: "test mode" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                "aria-pressed": mode === "time",
                onClick: () => reset("time", 30),
                children: "time"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                "aria-pressed": mode === "words",
                onClick: () => reset("words", 25),
                children: "words"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("fieldset", { className: "typing-practice__segmented", children: [
            /* @__PURE__ */ jsx("legend", { className: "typing-practice__sr-only", children: mode === "time" ? "test duration in seconds" : "word count" }),
            (mode === "time" ? TIME_OPTIONS : WORD_OPTIONS).map((value) => /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                "aria-label": mode === "time" ? `${value} seconds` : `${value} words`,
                "aria-pressed": option === value,
                onClick: () => reset(mode, value),
                children: value
              },
              value
            ))
          ] })
        ] }),
        /* @__PURE__ */ jsxs(
          "section",
          {
            className: "typing-practice__stats",
            "aria-label": "test statistics",
            children: [
              /* @__PURE__ */ jsxs("div", { className: "typing-practice__stat typing-practice__stat--primary", children: [
                /* @__PURE__ */ jsx("span", { children: "wpm" }),
                /* @__PURE__ */ jsx("output", { children: wpm })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "typing-practice__stat", children: [
                /* @__PURE__ */ jsx("span", { children: "accuracy" }),
                /* @__PURE__ */ jsxs("output", { children: [
                  accuracy,
                  "%"
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "typing-practice__stat typing-practice__stat--clock", children: [
                /* @__PURE__ */ jsx("span", { children: mode === "time" ? "time" : "elapsed" }),
                /* @__PURE__ */ jsx("output", { children: clock })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs("section", { className: "typing-practice__test", "aria-label": "typing test", children: [
          /* @__PURE__ */ jsxs("div", { className: "typing-practice__test-heading", children: [
            /* @__PURE__ */ jsx("span", { children: complete ? "test complete" : "type the words below" }),
            /* @__PURE__ */ jsx("span", { className: "typing-practice__test-detail", children: mode === "time" ? `${option} second test` : `${option} words` })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "typing-practice__prompt", children: [
            /* @__PURE__ */ jsxs(
              "p",
              {
                id: "typing-practice-instructions",
                className: "typing-practice__sr-only",
                children: [
                  "type this passage: ",
                  prompt
                ]
              }
            ),
            /* @__PURE__ */ jsx("p", { className: "typing-practice__prompt-text", "aria-hidden": "true", children: promptText }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                ref: inputRef,
                id: "typing-practice-input",
                className: "typing-practice__capture",
                "data-keybeats-surface": "",
                "aria-label": "typing test input",
                "aria-describedby": "typing-practice-instructions",
                autoCapitalize: "off",
                autoCorrect: "off",
                spellCheck: false,
                rows: 1,
                maxLength: prompt.length,
                value: typed,
                readOnly: complete,
                onChange: handleChange,
                onKeyDown: (event) => {
                  if (event.key === "Enter") event.preventDefault();
                }
              }
            )
          ] }),
          complete && /* @__PURE__ */ jsxs(
            "div",
            {
              className: "typing-practice__result",
              role: "status",
              "aria-live": "polite",
              children: [
                /* @__PURE__ */ jsx("span", { children: "test complete" }),
                /* @__PURE__ */ jsx("strong", { children: wpm }),
                /* @__PURE__ */ jsx("span", { children: "wpm" }),
                /* @__PURE__ */ jsxs("span", { className: "typing-practice__result-accuracy", children: [
                  accuracy,
                  "% accuracy"
                ] }),
                /* @__PURE__ */ jsx("button", { type: "button", onClick: () => reset(), children: "new test" })
              ]
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "typing-practice__hint", children: started ? "backspace corrects mistakes" : "the clock starts with your first key" })
        ] })
      ]
    }
  ) });
}
var hibitype_default = (sdk) => {
  configureReact(sdk.React);
  return {
    start(context) {
      const view = context.views.register({
        id: "test",
        label: "hibitype",
        location: "tab",
        lifetime: "session",
        Content: ({ visible }) => /* @__PURE__ */ jsx(TypingPractice, { visible })
      });
      const open = () => {
        view.open();
      };
      context.commands.register({
        id: "open",
        label: "open hibitype",
        keywords: "typing speed game words wpm accuracy",
        run: open
      });
      context.toolbar.register({
        id: "open",
        label: "hibitype",
        icon: KeyboardIcon,
        commandId: "open"
      });
    }
  };
};
export {
  hibitype_default as default
};
