import { db } from "@/lib/db";
import { tasks } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { deleteTask, toggleTask } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

/**
 * Dashboard Page (Task List Component)
 * 
 * This is a Server Component (async function) that:
 * 1. Fetches all tasks from the database using Drizzle ORM
 * 2. Displays them in a list with toggle (complete/incomplete) and delete buttons
 * 3. Shows task details: title, description, and quantity
 * 
 * Why "Server Component"? It runs on the server, fetches data directly,
 * no client JavaScript needed for reading data (only for forms/buttons)
 */
export default async function Dashboard() {
  // Server-side guard: only allow admin users
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) {
    redirect("/login");
  }
  // Fetch all tasks from database, ordered by newest first (desc = descending)
  const tasksList = await db.select().from(tasks).orderBy(desc(tasks.createdAt));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-md h-fit">
        <CardHeader>
          <CardTitle>Altitude Task Manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* 
            Link to Create Page: Button that navigates to the form
            - Link from "next/link": fast client-side navigation
            - href="/create-task": goes to the separate create-task page
          */}
          <Link href="/create-task">
            <Button className="w-full mb-4">Create New Task</Button>
          </Link>

          {/* TASK LIST */}
          <div className="space-y-2">
            {/* 
              tasksList.map(): Loop through all tasks and render each one
              - (task) => (...): For each task object, return JSX to display it
              - key={task.id}: Required for React to track list items efficiently
            */}
            {tasksList.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between py-2 px-4 border rounded-lg bg-white shadow-sm "
              >
                <div className="flex items-center gap-4">

                  {/* 
                    TOGGLE FORM: Click checkbox to mark task complete/incomplete
                    - action={async () => { "use server"; await toggleTask(...) }}
                    - This is an inline server action: runs on server when form submits
                    - task.id: which task to update
                    - !task.completed: flip the completed boolean (true→false, false→true)
                  */}
                  <form action={async () => {
                    "use server";
                    await toggleTask(task.id, !task.completed);
                  }}>
                    <button type="submit" className="flex items-center pt-1">
                      {/* 
                        Checkbox styling: shows black checkmark if task.completed is true
                        - Conditional CSS: ${task.completed ? "black" : "gray"} applies different colors
                        - {task.completed && <Check />}: only shows checkmark icon if task is done
                        - && operator: "render this ONLY IF task.completed is true"
                      */}
                      <div className={`
                        h-4 w-4 rounded border flex items-center justify-center transition-colors
                        ${task.completed
                          ? "bg-black border-black text-white"
                          : "border-gray-400 bg-white"
                        }
                      `}>
                        {task.completed && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  </form>

                  {/* 
                    Task Details Display: shows title, description, quantity
                    - {task.title}: render the task name from database
                    - className={task.completed ? "line-through" : ""}: add strikethrough style if done
                    - {task.description && (...)}: conditional render—only show description if it exists
                    - {task.quantity}: display the quantity number
                  */}
                  <div className="flex flex-col">
                    <div className={task.completed ? "line-through text-gray-400" : ""}>
                      {task.title}
                    </div>
                    <div>
                      {task.description && (
                        <span className="text-sm text-gray-500">{task.description}</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">Qty: {task.quantity}</div>
                  </div>
                </div>

                {/* 
                  DELETE FORM: Click button to remove task from database
                  - action={async () => { "use server"; await deleteTask(task.id) }}
                  - Inline server action that calls deleteTask with the task's id
                  - After deletion, revalidatePath("/") refreshes the page
                */}
                <form action={async () => {
                  "use server";
                  await deleteTask(task.id);
                }}>
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            ))}
            {/* 
              Empty State: Show message if no tasks exist
              - {tasksList.length === 0 && (...)}: render this ONLY if list is empty
              - tasksList.length: number of items in the array (0 = empty)
            */}
            {tasksList.length === 0 && (
              <p className="text-center text-gray-500 text-sm">No tasks found.</p>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
