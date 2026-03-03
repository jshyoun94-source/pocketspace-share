import { Redirect } from "expo-router";
import React from "react";

export default function MyOwnerReviewsRedirect() {
  return <Redirect href={{ pathname: "/my-reviews", params: { role: "owner" } }} />;
}

