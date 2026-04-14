import { createTask } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

/**
 * CreateTaskPage
 *
 * Server-rendered page that shows a form to add new tasks.
 * Submitting the form runs the `createTask` server action.
 * After creation, the home/dashboard pages will revalidate and show the new item.
 */
export default function CreateTaskPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-md h-fit">
        <CardHeader>
          <CardTitle>Create New Task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Form posts to the server action. Input names map to FormData keys. */}
          <form action={createTask} className="flex flex-col gap-4">
            <Input name="title" placeholder="What needs to be done?" required />
            <Input name="description" placeholder="Description (optional)" />
            <Input name="quantity" type="number" min="0" placeholder="Quantity (optional)" />
            <Button type="submit">Add Task</Button>
          </form>

          {/* Navigate back to dashboard or home */}
          <div className="space-y-4">
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">Back to Dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
