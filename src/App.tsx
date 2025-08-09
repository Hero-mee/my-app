import React, { useMemo, useState } from "react";

// =====================
// Types
// =====================
export type MealTime = "朝" | "昼" | "夜";

export interface NutrientItem {
  材料名: string;
  数量?: string;
  重量?: string; // e.g., "100g"
  カロリー?: string; // e.g., "120kcal"
  たんぱく質?: string; // e.g., "10g"
  脂質?: string; // e.g., "5g"
  炭水化物?: string; // e.g., "20g"
}

interface RegisteredRecipe {
  name: string;
  ingredients: NutrientItem[];
}

interface CalorieSplit {
  morning: number; // %
  lunch: number;   // %
  dinner: number;  // %
}

interface Totals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface PFCTarget {
  protein: number;
  fat: number;
  carbs: number;
}

// 1日分の記録: 同一時間帯に複数回食べた場合も積み上げる
// 時間帯 -> (食事)[] -> (食材NutrientItem)[]
export type DayRecord = Record<MealTime, NutrientItem[][]>;

// 日付(yyyy-mm-dd) -> DayRecord
export type DailyRecords = Record<string, DayRecord>;

// =====================
// Utils
// =====================
const numFromUnitString = (v?: string): number => {
  if (!v) return 0;
  const n = parseFloat((v as string).replace(/[^\d.\-]+/g, ""));
  return isNaN(n) ? 0 : n;
};

const toFixedSafe = (n: number, d = 1) => Number.isFinite(n) ? n.toFixed(d) : "0.0";

const todayISO = () => new Date().toISOString().slice(0, 10);

// =====================
// Component
// =====================
const App: React.FC = () => {
  // レシピ登録関連
  const [recipeName, setRecipeName] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  const [registeredRecipes, setRegisteredRecipes] = useState<RegisteredRecipe[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedName, setEditedName] = useState<string>("");
  const [editedIngredients, setEditedIngredients] = useState<string>("");

  // 抽出結果・合計
  const [ingredients, setIngredients] = useState<NutrientItem[]>([]);
  const [totalCalories, setTotalCalories] = useState<number>(0);
  const [totalProtein, setTotalProtein] = useState<number>(0);
  const [totalFat, setTotalFat] = useState<number>(0);
  const [totalCarbs, setTotalCarbs] = useState<number>(0);

  // 目標関連
  const [goalCalories, setGoalCalories] = useState<number>(1200);
  const [goalType, setGoalType] = useState<string>("減量");
  const [calorieSplit, setCalorieSplit] = useState<CalorieSplit>({ morning: 30, lunch: 40, dinner: 30 });
  const [mealTime, setMealTime] = useState<MealTime>("朝");
  const [pfcGrams, setPfcGrams] = useState<PFCTarget>({ protein: 80, fat: 40, carbs: 150 });

  // 記録
  const [dailyRecords, setDailyRecords] = useState<DailyRecords>({});

  const [loading, setLoading] = useState<boolean>(false);


  const getTotalForDate = (date: string): Totals => {
    const records = dailyRecords[date];
    if (!records) return { kcal: 0, protein: 0, fat: 0, carbs: 0 };

    let totalKcal = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;

    (Object.values(records) as NutrientItem[][][]).forEach((mealTimes) => {
      mealTimes.forEach((meal) => {
        meal.forEach((item) => {
          totalKcal += numFromUnitString(item.カロリー);
          totalProtein += numFromUnitString(item.たんぱく質);
          totalFat += numFromUnitString(item.脂質);
          totalCarbs += numFromUnitString(item.炭水化物);
        });
      });
    });

    return {
      kcal: Number(toFixedSafe(totalKcal, 1)),
      protein: Number(toFixedSafe(totalProtein, 1)),
      fat: Number(toFixedSafe(totalFat, 1)),
      carbs: Number(toFixedSafe(totalCarbs, 1)),
    };
  };

  const today = todayISO();
  const totalToday = useMemo(() => getTotalForDate(today), [dailyRecords, today]);

// iOS Safari のダークモード検出
const prefersDark =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

// 使い方ガイドのカード用スタイル
const guideCardStyle: React.CSSProperties = {
  margin: "12px 0 20px",
  padding: "12px 14px",
  background: prefersDark ? "#111827" : "#fafafa",     // ← ダーク時は濃いグレー
  border: `1px solid ${prefersDark ? "#334155" : "#e5e7eb"}`,
  borderRadius: 12,
  color: "inherit",                                     // ← 文字色は継承
};

  // =====================
  // API呼び出し（注意: 本番はサーバー側に秘匿してください）
  // =====================

  const registerRecipe = async () => {
    if (!recipeName || !inputText) {
      alert("レシピ名と材料を入力してください");
      return;
    }

    setLoading(true);

    const prompt = `\n${"${inputText}"}\n`; // そのままの仕様を踏襲（実際は不要なテンプレ文字は削るのが安全）

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,

        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const message: string | undefined = data?.choices?.[0]?.message?.content;
      if (!message) {
        alert("API応答がありません。APIキーが正しいか確認してください。");
        setLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(message);
        if (Array.isArray(parsed)) {
          const newRecipe: RegisteredRecipe = { name: recipeName, ingredients: parsed };
          setRegisteredRecipes((prev) => [...prev, newRecipe]);
        } else {
          alert("形式が正しくありません");
        }
      } catch (err) {
        console.error(err);
        alert("GPTの返答がJSON形式じゃなかったかも💦\n" + message);
      }
    } catch (e) {
      console.error(e);
      alert("GPTの処理でエラーが発生しました💦");
    } finally {
      setLoading(false);
    }
  };

  const startEditRecipe = (index: number) => {
    setEditingIndex(index);
    setEditedName(registeredRecipes[index].name);
    setEditedIngredients(
      registeredRecipes[index].ingredients
        .map((ing) => `${ing.材料名}${ing.数量 ? ` ${ing.数量}` : ""}`)
        .join("、")
    );
  };

  const saveEditedRecipe = () => {
    if (editingIndex === null) return;
    if (!editedName || !editedIngredients) {
      alert("レシピ名と材料を入力してください");
      return;
    }

    const updated = [...registeredRecipes];
    updated[editingIndex] = {
      ...updated[editingIndex],
      name: editedName,
      // 今回は材料テキストの再パースは割愛（必要ならここで分解して上書き）
    };
    setRegisteredRecipes(updated);
    setEditingIndex(null);
  };

  const deleteRecipe = (index: number) => {
    const updated = [...registeredRecipes];
    updated.splice(index, 1);
    setRegisteredRecipes(updated);
  };

  const callGPT = async () => {
    if (!inputText) {
      alert("食材の文章を入力してください");
      return;
    }

    setLoading(true);

    const prompt = `以下の文章から、食材ごとに以下の情報をJSON形式で抽出してください：\n\n[\n  {\n    "材料名": "○○",\n    "数量": "○○",\n    "重量": "○○g",\n    "カロリー": "○○kcal",\n    "たんぱく質": "○○g",\n    "脂質": "○○g",\n    "炭水化物": "○○g"\n  }\n]\n\nなお、「数量」が「1枚」「1個」など曖昧な場合は、おおよそのg数（重量）を推定して「重量」に記載してください。\nカロリーと栄養素は、重量に応じて推定してください。\n\n文章：\n"${inputText}"`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,

        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const message: string | undefined = data?.choices?.[0]?.message?.content;

      if (!message) {
        alert("API応答がありません。APIキーが正しいか確認してください。");
        setLoading(false);
        return;
      }

      try {
        const parsed: unknown = JSON.parse(message);

        if (Array.isArray(parsed)) {
          const arr = parsed as NutrientItem[];

          // 合計計算
          let kcalSum = 0, proteinSum = 0, fatSum = 0, carbSum = 0;
          arr.forEach((item) => {
            kcalSum += numFromUnitString(item.カロリー);
            proteinSum += numFromUnitString(item.たんぱく質);
            fatSum += numFromUnitString(item.脂質);
            carbSum += numFromUnitString(item.炭水化物);
          });

          const mealRatiosCalc: Record<MealTime, number> = {
            "朝": calorieSplit.morning / 100,
            "昼": calorieSplit.lunch / 100,
            "夜": calorieSplit.dinner / 100,
          };

          const scaleBase = kcalSum || 1; // 0割回避
          const scaleFactor = (mealRatiosCalc[mealTime] * goalCalories) / scaleBase;

          const scaledIngredients: NutrientItem[] = arr.map((item) => {
            const kcal = numFromUnitString(item.カロリー);
            const protein = numFromUnitString(item.たんぱく質);
            const fat = numFromUnitString(item.脂質);
            const carb = numFromUnitString(item.炭水化物);

            return {
              ...item,
              カロリー: `${toFixedSafe(kcal * scaleFactor)}kcal`,
              たんぱく質: `${toFixedSafe(protein * scaleFactor)}g`,
              脂質: `${toFixedSafe(fat * scaleFactor)}g`,
              炭水化物: `${toFixedSafe(carb * scaleFactor)}g`,
            };
          });

          setIngredients(scaledIngredients);
          setTotalCalories(Number(toFixedSafe(kcalSum * scaleFactor)));
          setTotalProtein(Number(toFixedSafe(proteinSum * scaleFactor)));
          setTotalFat(Number(toFixedSafe(fatSum * scaleFactor)));
          setTotalCarbs(Number(toFixedSafe(carbSum * scaleFactor)));

          // 記録へ積み上げ（複数回対応）
          const dateKey = todayISO();
          setDailyRecords((prev) => {
            const updated: DailyRecords = { ...prev };
            if (!updated[dateKey]) {
              updated[dateKey] = { "朝": [], "昼": [], "夜": [] };
            }
            updated[dateKey][mealTime].push(scaledIngredients);
            return updated;
          });
        } else if ((parsed as any)?.ingredients && Array.isArray((parsed as any).ingredients)) {
          const arr = (parsed as any).ingredients as NutrientItem[];
          setIngredients(arr);
          const total = arr.reduce((sum, item) => sum + numFromUnitString(item.カロリー), 0);
          setTotalCalories(total);
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as NutrientItem;
          setIngredients([obj]);
          setTotalCalories(numFromUnitString(obj.カロリー));
        } else {
          alert("想定外の返却形式でした");
        }
      } catch (e) {
        console.error(e);
        alert("GPTの返答がJSON形式じゃなかったかも💦\n" + message);
      }
    } catch (e) {
      console.error(e);
      alert("GPTの処理でエラーが発生しました💦");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>GPTカロリー抽出テスト</h1>

{/* ▼ 使い方ガイド */}
<details
  open
  style={{
    margin: "12px 0 20px",
    padding: "12px 14px",
    background:
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "#111827" // ダークモード時の背景
        : "#fafafa", // ライトモード時の背景
    border:
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "1px solid #334155" // ダーク時の枠線
        : "1px solid #e5e7eb", // ライト時の枠線
    borderRadius: 12,
    color: "inherit", // 文字色は継承
  }}
>
  <summary
    style={{
      cursor: "pointer",
      fontWeight: 600,
      fontSize: 16,
      color: "inherit",
    }}
  >
    📖 このアプリの使い方（クリックで開閉）
  </summary>

  <div style={{ marginTop: 10, lineHeight: 1.7 }}>
    <h3 style={{ margin: "10px 0 6px" }}>🍳 レシピ登録</h3>
    <ol style={{ paddingLeft: 18 }}>
      <li><b>レシピ名</b>を入力（例：チキンサラダ）</li>
      <li><b>材料</b>を入力（例：鶏むね肉100g、キャベツ50g、ゆで卵1個）</li>
      <li>「<b>レシピ登録</b>」で登録。GPTが栄養情報を自動抽出します</li>
    </ol>

    <h3 style={{ margin: "12px 0 6px" }}>🥗 栄養計算（単発）</h3>
    <ol style={{ paddingLeft: 18 }}>
      <li>材料を入力して「<b>GPTで抽出</b>」を押す</li>
      <li>カロリー・PFCが表示され、<b>当日の記録に自動追加</b>されます</li>
    </ol>

    <h3 style={{ margin: "12px 0 6px" }}>🎯 目標設定</h3>
    <ul style={{ paddingLeft: 18, margin: 0 }}>
      <li>1日の<b>目標カロリー</b>と<b>目的（減量・維持・増量）</b>を選択</li>
      <li><b>朝/昼/夜の比率</b>を%で調整できます</li>
    </ul>

    <h3 style={{ margin: "12px 0 6px" }}>📊 表示</h3>
    <ul style={{ paddingLeft: 18, margin: 0 }}>
      <li>当日の<b>合計カロリーとPFC</b>を集計表示</li>
      <li>各食材ごとにも<b>PFCバー</b>で可視化</li>
    </ul>

    <h3 style={{ margin: "12px 0 6px" }}>💡 補足</h3>
    <ul style={{ paddingLeft: 18, margin: 0 }}>
      <li>APIキーは <code>.env</code> に <code>VITE_OPENAI_API_KEY</code> を設定</li>
      <li>Viteは <code>VITE_</code> で始まる環境変数のみ参照できます</li>
      <li>通信エラー時はブラウザの <b>Network/Console</b> を確認してください</li>
    </ul>
  </div>
</details>
{/* ▲ 使い方ガイド */}

      <h2>📆 {today} のトータル</h2>
      <ul>
        <li>カロリー: {toFixedSafe(totalToday.kcal, 1)} kcal</li>
        <li>たんぱく質: {toFixedSafe(totalToday.protein, 1)} g</li>
        <li>脂質: {toFixedSafe(totalToday.fat, 1)} g</li>
        <li>炭水化物: {toFixedSafe(totalToday.carbs, 1)} g</li>
      </ul>

      <h2>レシピ登録</h2>
      <div style={{ marginBottom: 10 }}>
        <label>レシピ名：</label>
        <br />
        <input
          type="text"
          value={recipeName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipeName(e.target.value)}
          placeholder="例：チキンサラダ"
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>材料（例：鶏むね肉100g、キャベツ50g）:</label>
        <br />
        <textarea
          value={inputText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
          rows={3}
          cols={50}
        />
      </div>

      <button onClick={registerRecipe} disabled={loading}>
        {loading ? "登録中..." : "レシピ登録"}
      </button>

      <hr />

      <h3>登録済みレシピ：</h3>
      <ul>
        {registeredRecipes.map((recipe, idx) => (
          <li key={idx}>
            {editingIndex === idx ? (
              <div>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedName(e.target.value)}
                  placeholder="レシピ名"
                />
                <textarea
                  value={editedIngredients}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditedIngredients(e.target.value)}
                  rows={2}
                  placeholder="材料（例：鶏むね肉100g、キャベツ50g）"
                />
                <button onClick={saveEditedRecipe}>💾 保存</button>
                <button onClick={() => setEditingIndex(null)}>キャンセル</button>
              </div>
            ) : (
              <>
                <strong>{recipe.name}</strong>
                <button onClick={() => startEditRecipe(idx)} style={{ marginLeft: 10 }}>✏️ 編集</button>
                <button onClick={() => deleteRecipe(idx)} style={{ marginLeft: 10 }}>🗑️ 削除</button>
                <ul>
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i}>
                      {ing.材料名} - {ing.数量 ?? ""}（{ing.カロリー ?? "?"}） / P: {ing.たんぱく質 ?? "?"}, F: {ing.脂質 ?? "?"}, C: {ing.炭水化物 ?? "?"}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>

      <h2>目標設定</h2>
      <div style={{ marginBottom: 10 }}>
  <label>目標たんぱく質 (g)：</label>
  <br />
  <input
    type="number"
    value={pfcGrams.protein}
    onChange={(e) =>
      setPfcGrams({ ...pfcGrams, protein: Number(e.target.value) })
    }
    style={{ width: 80, marginRight: 10 }}
  />
</div>

<div style={{ marginBottom: 10 }}>
  <label>目標脂質 (g)：</label>
  <br />
  <input
    type="number"
    value={pfcGrams.fat}
    onChange={(e) =>
      setPfcGrams({ ...pfcGrams, fat: Number(e.target.value) })
    }
    style={{ width: 80, marginRight: 10 }}
  />
</div>

<div style={{ marginBottom: 20 }}>
  <label>目標炭水化物 (g)：</label>
  <br />
  <input
    type="number"
    value={pfcGrams.carbs}
    onChange={(e) =>
      setPfcGrams({ ...pfcGrams, carbs: Number(e.target.value) })
    }
    style={{ width: 80 }}
  />
</div>
      <div style={{ marginBottom: 10 }}>
        <label>1日の目標カロリー（kcal）：</label>
        <br />
        <input
          type="number"
          value={goalCalories}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGoalCalories(Number(e.target.value))}
          placeholder="例: 1200"
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label>食事のカロリー配分（%）：</label>
        <br />
        朝：
        <input
          type="number"
          value={calorieSplit.morning}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCalorieSplit({ ...calorieSplit, morning: Number(e.target.value) })}
          style={{ width: 60, marginRight: 10 }}
        />
        昼：
        <input
          type="number"
          value={calorieSplit.lunch}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCalorieSplit({ ...calorieSplit, lunch: Number(e.target.value) })}
          style={{ width: 60, marginRight: 10 }}
        />
        夜：
        <input
          type="number"
          value={calorieSplit.dinner}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCalorieSplit({ ...calorieSplit, dinner: Number(e.target.value) })}
          style={{ width: 60 }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label>目的：</label>
        <br />
        <select value={goalType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGoalType(e.target.value)}>
          <option value="減量">減量</option>
          <option value="維持">維持</option>
          <option value="増量">増量</option>
        </select>
      </div>

{/* ▼ 目標PFC（g）を編集できるUIを追加 */}
<div style={{ marginBottom: 10 }}>
  <label>目標たんぱく質 (g)：</label>
  <br />
  <input
    type="number"
    value={pfcGrams.protein}
    onChange={(e) => setPfcGrams({ ...pfcGrams, protein: Number(e.target.value) })}
    style={{ width: 80, marginRight: 10 }}
  />
</div>

<div style={{ marginBottom: 10 }}>
  <label>目標脂質 (g)：</label>
  <br />
  <input
    type="number"
    value={pfcGrams.fat}
    onChange={(e) => setPfcGrams({ ...pfcGrams, fat: Number(e.target.value) })}
    style={{ width: 80, marginRight: 10 }}
  />
</div>

<div style={{ marginBottom: 20 }}>
  <label>目標炭水化物 (g)：</label>
  <br />
  <input
    type="number"
    value={pfcGrams.carbs}
    onChange={(e) => setPfcGrams({ ...pfcGrams, carbs: Number(e.target.value) })}
    style={{ width: 80 }}
  />
</div>
{/* ▲ 目標PFC UI ここまで */}


      <div style={{ marginBottom: 20 }}>
        <label>この食事はいつの食事ですか？：</label>
        <br />
        <select value={mealTime} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMealTime(e.target.value as MealTime)}>
          <option value="朝">朝</option>
          <option value="昼">昼</option>
          <option value="夜">夜</option>
        </select>
      </div>

      <textarea
        placeholder="鶏むね肉、レタス、卵 など"
        value={inputText}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
        rows={3}
        cols={50}
      />
      <br />
      <button onClick={callGPT} disabled={loading}>
        {loading ? "分析中..." : "GPTで抽出"}
      </button>

      <h2>結果：</h2>
      <h3>目標たんぱく質: {pfcGrams.protein} g</h3>
      <h3>目標脂質: {pfcGrams.fat} g</h3>
      <h3>目標炭水化物: {pfcGrams.carbs} g</h3>

      <h3>合計カロリー: {toFixedSafe(totalCalories, 1)} kcal</h3>
      <h3>合計たんぱく質: {toFixedSafe(totalProtein, 1)} g</h3>
      <h3>合計脂質: {toFixedSafe(totalFat, 1)} g</h3>
      <h3>合計炭水化物: {toFixedSafe(totalCarbs, 1)} g</h3>

      {/* 合計栄養素のバー表示 */}
      <div style={{ marginTop: 20 }}>
        <h3>合計の栄養素グラフ</h3>

        <div>
          🥚 たんぱく質：{toFixedSafe(totalProtein, 1)}g
          <div style={{ background: "#eee", height: 12, width: "100%", marginBottom: 8 }}>
            <div style={{ width: `${Math.min((totalProtein / 100) * 100, 100)}%`, background: "#4caf50", height: "100%" }} />
          </div>
        </div>

        <div>
          🧈 脂質：{toFixedSafe(totalFat, 1)}g
          <div style={{ background: "#eee", height: 12, width: "100%", marginBottom: 8 }}>
            <div style={{ width: `${Math.min((totalFat / 100) * 100, 100)}%`, background: "#f44336", height: "100%" }} />
          </div>
        </div>

        <div>
          🍞 炭水化物：{toFixedSafe(totalCarbs, 1)}g
          <div style={{ background: "#eee", height: 12, width: "100%" }}>
            <div style={{ width: `${Math.min((totalCarbs / 100) * 100, 100)}%`, background: "#2196f3", height: "100%" }} />
          </div>
        </div>
      </div>

      <ul>
        {ingredients.map((item, index) => {
          const protein = numFromUnitString(item.たんぱく質);
          const fat = numFromUnitString(item.脂質);
          const carb = numFromUnitString(item.炭水化物);
          const max = 100;

          return (
            <li key={index} style={{ marginBottom: 16 }}>
              <strong>{item.材料名}</strong>：{item.数量 ?? ""} {item.重量 ? `（約${item.重量}）` : ""}（{item.カロリー ?? "？"}）
              <br />
              🥚 たんぱく質：{toFixedSafe(protein, 1)}g
              <div style={{ background: "#eee", height: 8, width: "100%", marginBottom: 4 }}>
                <div style={{ width: `${(protein / max) * 100}%`, background: "#4caf50", height: "100%" }} />
              </div>
              🧈 脂質：{toFixedSafe(fat, 1)}g
              <div style={{ background: "#eee", height: 8, width: "100%", marginBottom: 4 }}>
                <div style={{ width: `${(fat / max) * 100}%`, background: "#f44336", height: "100%" }} />
              </div>
              🍞 炭水化物：{toFixedSafe(carb, 1)}g
              <div style={{ background: "#eee", height: 8, width: "100%" }}>
                <div style={{ width: `${(carb / max) * 100}%`, background: "#2196f3", height: "100%" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default App;
