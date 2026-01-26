import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "GET request received" });
}

export async function POST() {
  return NextResponse.json({ message: "POST request received" });
}

export async function PUT() {
  return NextResponse.json({ message: "PUT request received" });
}

export async function PATCH() {
  return NextResponse.json({ message: "PATCH request received" });
}

export async function DELETE() {
  return NextResponse.json({ message: "DELETE request received" });
}
