import { Redirect } from "expo-router";
import React from "react";

export default function MyCustomerReviewsRedirect() {
  return (
    <Redirect href={{ pathname: "/my-reviews", params: { role: "customer" } }} />
  );
}

