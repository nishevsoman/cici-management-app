"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const login = async () => {
    console.log("clicked login");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log(error);

    if (!error) {
      router.push("/dashboard");
      router.refresh(); // VERY IMPORTANT
    } else {
      alert(error.message);
    }
  };

  return (
    <div className="p-10">
      <input
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2"
      />
      <input
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 block mt-2"
      />
      <button
        onClick={login}
        className="mt-4 bg-black text-white p-2"
      >
        Login
      </button>
    </div>
  );
}